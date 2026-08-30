import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { newRecordId } from '../../hooks/mutations/shared';
import { useNotificationRegistrationMutations } from '../../hooks/mutations/use-notification-registration-mutations';
import { useNotificationTypeRoster } from '../../hooks/queries/use-catalog-rosters';
import {
	type RegistrationRecord,
	useRegistration,
	useRegistrationSubscriptions,
} from '../../hooks/queries/use-registration-record';
import { useUnitLabels } from '../../hooks/queries/use-unit-labels';
import { useAuthSnapshot } from '../../hooks/use-auth-snapshot';
import {
	NOTIFICATION_REGISTRATION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../hooks/use-owned-geometry';
import { DrawToolbar } from '../map/geometry-control';
import type { DrawGeometryType, MapDrawController } from '../map/use-map-draw';
import type { RegistrationDraftState } from './contact-registrations';
import {
	bufferFrom,
	defaultRegistrationFormValues,
	RegistrationFormFields,
	type RegistrationFormValues,
	useRegistrationLocation,
	validateRegistration,
} from './registration-form';
import { formValuesOf, reconcileSubscriptions, savedFieldsOf } from './registration-values';

export interface RegistrationDraftProps {
	readonly contactId: string;
	readonly draft: RegistrationDraftState;
	/** The page's canvas. The draft draws on it rather than owning one. */
	readonly map: MapboxMap | null;
	readonly onCancel: () => void;
	readonly onSaved: (message: string) => void;
	/** Where the draw toolbar is drawn, so it sits over the map it controls. */
	readonly toolbarSlot: HTMLElement | null;
}

/**
 * One registration being added or changed, in the results panel.
 *
 * Two entry points into one form. Creating starts from the defaults with nothing
 * drawn; editing has to read the saved row, its subscriptions and its geometry
 * first, and cannot mount until all three are in hand.
 */
export function RegistrationDraft(props: RegistrationDraftProps) {
	return props.draft.kind === 'create' ? (
		<CreateDraft {...props} />
	) : (
		<EditDraft {...props} registrationId={props.draft.registrationId} />
	);
}

function CreateDraft({
	contactId,
	draft,
	map,
	onCancel,
	onSaved,
	toolbarSlot,
}: RegistrationDraftProps) {
	const mutations = useNotificationRegistrationMutations();
	// Queried before it exists: `notification_registrations` is on-demand, and a
	// write into a collection nothing is querying waits out a txid confirmation
	// that never arrives, which reads as a frozen save rather than a slow one.
	useRegistration(draft.registrationId);

	const onSave = useCallback(
		async (values: RegistrationFormValues, geometry: NonNullable<DraftGeometry>) => {
			await mutations.record({
				registrationId: draft.registrationId,
				contactId,
				location: { addressId: values.addressId, geometry },
				buffer: bufferFrom(values),
				flags: { hasBees: values.hasBees, isNoSpray: values.isNoSpray },
				// The link rows are part of the same write, so their ids are minted
				// here alongside the registration's.
				subscriptions: values.notificationTypeIds.map((notificationTypeId) => ({
					notificationRegistrationTypeId: newRecordId(),
					notificationTypeId,
				})),
			});
			onSaved('Registration added.');
		},
		[contactId, draft.registrationId, mutations, onSaved],
	);

	return (
		<DraftForm
			canSubmit={mutations.canWrite}
			defaultValues={{ ...defaultRegistrationFormValues(), contactId }}
			initialGeometry={null}
			map={map}
			onCancel={onCancel}
			onSave={onSave}
			submitLabel="Add registration"
			toolbarSlot={toolbarSlot}
		/>
	);
}

function EditDraft({
	map,
	onCancel,
	onSaved,
	registrationId,
	toolbarSlot,
}: RegistrationDraftProps & { readonly registrationId: string }) {
	const mutations = useNotificationRegistrationMutations();
	const { registration, isReady, isError } = useRegistration(registrationId);

	if (isError) {
		return <DraftError message="This registration could not be loaded." onCancel={onCancel} />;
	}
	if (!isReady) {
		return <DraftSkeleton />;
	}
	if (registration === undefined) {
		return <DraftError message="This registration is no longer here." onCancel={onCancel} />;
	}

	return (
		<EditDraftLoader
			map={map}
			mutations={mutations}
			onCancel={onCancel}
			onSaved={onSaved}
			registration={registration}
			toolbarSlot={toolbarSlot}
		/>
	);
}

function EditDraftLoader({
	map,
	mutations,
	onCancel,
	onSaved,
	registration,
	toolbarSlot,
}: {
	readonly map: MapboxMap | null;
	readonly mutations: ReturnType<typeof useNotificationRegistrationMutations>;
	readonly onCancel: () => void;
	readonly onSaved: (message: string) => void;
	readonly registration: RegistrationRecord;
	readonly toolbarSlot: HTMLElement | null;
}) {
	const { subscriptions, isReady: subscriptionsReady } = useRegistrationSubscriptions(
		registration.id,
	);
	// `geom` never syncs (ADR 0009), so the drawn shape is read back over the
	// geometry endpoint rather than off the row. Keyed on `updatedAt` so a save
	// re-reads rather than re-showing the shape the form just replaced.
	const savedGeometry = useOwnedGeometry(
		NOTIFICATION_REGISTRATION_GEOMETRY_SOURCE,
		registration.id,
		registration.updatedAt.toISOString(),
	);

	const onSave = useCallback(
		async (values: RegistrationFormValues, geometry: NonNullable<DraftGeometry>) => {
			await mutations.save({
				registrationId: registration.id,
				fields: {
					contactId: registration.contactId,
					addressId: values.addressId,
					buffer: bufferFrom(values),
					flags: { hasBees: values.hasBees, isNoSpray: values.isNoSpray },
				},
				current: savedFieldsOf(registration),
				geometry,
			});
			await reconcileSubscriptions({
				chosen: values.notificationTypeIds,
				current: subscriptions,
				mutations,
				registrationId: registration.id,
			});
			onSaved('Registration updated.');
		},
		[mutations, onSaved, registration, subscriptions],
	);

	if (savedGeometry.isError) {
		return (
			<DraftError message="This registration's geometry could not be loaded." onCancel={onCancel} />
		);
	}

	/*
	 * Both gate the mount rather than re-seeding the form, because `useAppForm`
	 * takes `defaultValues` once and the location controller seeds its geometry
	 * with `useState`. A form mounted before either arrives shows an empty map and
	 * no subscriptions, and neither ever fills in.
	 *
	 * The subscriptions are the dangerous half. `onSave` reconciles the form's
	 * chosen types against the live list, so a form that mounted holding `[]`
	 * would unsubscribe every notification type on a save that only touched the
	 * buffer, and say nothing about it.
	 */
	if (savedGeometry.isPending || !subscriptionsReady) {
		return <DraftSkeleton />;
	}

	return (
		<DraftForm
			canSubmit={mutations.canWrite}
			defaultValues={formValuesOf(registration, subscriptions)}
			initialGeometry={(savedGeometry.geometry ?? null) as DraftGeometry}
			map={map}
			onCancel={onCancel}
			onDelete={async () => {
				await mutations.remove(registration.id);
				onSaved('Registration removed.');
			}}
			onSave={onSave}
			submitLabel="Save registration"
			toolbarSlot={toolbarSlot}
		/>
	);
}

/** What the location controller calls a shape. Kept local so the props read plainly. */
type DraftGeometry = Parameters<typeof useRegistrationLocation>[1];

function DraftForm({
	canSubmit,
	defaultValues,
	initialGeometry,
	map,
	onCancel,
	onDelete,
	onSave,
	submitLabel,
	toolbarSlot,
}: {
	readonly canSubmit: boolean;
	readonly defaultValues: RegistrationFormValues;
	readonly initialGeometry: DraftGeometry;
	readonly map: MapboxMap | null;
	readonly onCancel: () => void;
	/** Absent while adding: there is nothing saved yet to remove. */
	readonly onDelete?: (() => Promise<void>) | undefined;
	readonly onSave: (
		values: RegistrationFormValues,
		geometry: NonNullable<DraftGeometry>,
	) => Promise<void>;
	readonly submitLabel: string;
	readonly toolbarSlot: HTMLElement | null;
}) {
	const [saveError, setSaveError] = useState<string | null>(null);
	const organizationId = useOrganizationId();
	const { all: units } = useUnitLabels();
	// Active only: the domain refuses a subscription to a retired type, and a
	// retired one on the list is a choice that fails at save.
	const notificationTypes = useNotificationTypeRoster()
		.filter((type) => type.isActive)
		.map((type) => ({ id: type.id, label: type.name }));

	const location = useRegistrationLocation(map, initialGeometry);
	const { draw, geometry, geometryType } = location;

	const form = useAppForm({
		defaultValues,
		// The same context-free rules the standalone form ran. Without them a save
		// with no notification type reaches the server, which refuses it, and the
		// user reads a command refusal for a field the form could have flagged.
		validators: {
			onSubmit: (input: { readonly value: RegistrationFormValues }) =>
				validateRegistration(input.value, geometry),
		},
		onSubmit: async ({ value }: { readonly value: RegistrationFormValues }) => {
			setSaveError(null);
			location.clearError();
			if (geometry === null) {
				location.setError('Draw the place this registration covers.');
				return;
			}
			try {
				await onSave(value, geometry);
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save registration.');
			}
		},
	});

	return (
		<form.AppForm>
			<form
				className="grid gap-5"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to save registration" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to save registration</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				{organizationId === null ? (
					<DraftSkeleton />
				) : (
					<RegistrationFormFields
						form={form}
						location={location}
						notificationTypes={notificationTypes}
						organizationId={organizationId}
						units={units}
					/>
				)}

				<DraftToolbar controller={draw} geometryType={geometryType} toolbarSlot={toolbarSlot} />

				<DraftActions
					canSubmit={canSubmit}
					form={form}
					onCancel={onCancel}
					onDelete={onDelete}
					onFailure={setSaveError}
					submitLabel={submitLabel}
				/>
			</form>
		</form.AppForm>
	);
}

/**
 * The draw toolbar, over the map rather than in this panel.
 *
 * It prompts for a click on the map and finishes a shape being drawn there.
 * Portalled rather than lifted: `useMapDraw` returns a fresh object every
 * render, so a parent holding the controller in state would re-render forever.
 */
function DraftToolbar({
	controller,
	geometryType,
	toolbarSlot,
}: {
	readonly controller: MapDrawController;
	readonly geometryType: DrawGeometryType;
	readonly toolbarSlot: HTMLElement | null;
}) {
	if (toolbarSlot === null) {
		return null;
	}

	return createPortal(
		<DrawToolbar
			controller={controller}
			geometryType={geometryType}
			pointPrompt="Click the map to place this registration."
		/>,
		toolbarSlot,
	);
}

/**
 * What the draft can be finished with.
 *
 * Remove sits beside the save rather than in a danger zone of its own. The old
 * detail page had one and there is no detail page now: without this a
 * registration recorded by mistake could be switched off but never removed.
 */
function DraftActions({
	canSubmit,
	form,
	onCancel,
	onDelete,
	onFailure,
	submitLabel,
}: {
	readonly canSubmit: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly onCancel: () => void;
	readonly onDelete?: (() => Promise<void>) | undefined;
	readonly onFailure: (message: string) => void;
	readonly submitLabel: string;
}) {
	const [isDeleting, setIsDeleting] = useState(false);

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{onDelete === undefined ? null : (
				<Button
					className="mr-auto"
					disabled={isDeleting}
					onClick={() => {
						setIsDeleting(true);
						void onDelete().catch((thrown: unknown) => {
							setIsDeleting(false);
							onFailure(
								thrown instanceof Error ? thrown.message : 'Unable to remove registration.',
							);
						});
					}}
					size="sm"
					type="button"
					variant="ghost"
				>
					{isDeleting ? 'Removing…' : 'Remove'}
				</Button>
			)}
			<Button onClick={onCancel} size="sm" type="button" variant="outline">
				Cancel
			</Button>
			<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
		</div>
	);
}

function useOrganizationId(): string | null {
	const auth = useAuthSnapshot();
	return auth?.authenticated === true ? (auth.localIdentity?.organizationId ?? null) : null;
}

function DraftError({
	message,
	onCancel,
}: {
	readonly message: string;
	readonly onCancel: () => void;
}) {
	return (
		<Alert variant="destructive">
			<AlertTitle>Registration unavailable</AlertTitle>
			<AlertDescription className="grid gap-3">
				<span>{message}</span>
				<Button className="justify-self-start" onClick={onCancel} size="sm" variant="outline">
					Back to the list
				</Button>
			</AlertDescription>
		</Alert>
	);
}

function DraftSkeleton() {
	return (
		<div className="grid gap-4">
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
	);
}
