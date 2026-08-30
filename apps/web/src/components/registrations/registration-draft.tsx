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
import type { Acknowledgements } from '../acknowledged-write';
import { DangerZoneCard } from '../danger-zone-card';
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
	/**
	 * Runs an edit's save so a refusal a confirmation can answer becomes a
	 * question.
	 *
	 * Held by the page rather than here: an applied save moves the row's
	 * `updated_at`, the geometry read is keyed on it, and this form is a skeleton
	 * again before the refusal lands. A create answers no questions, so only the
	 * edit path uses it.
	 */
	readonly askSave: (write: (acknowledgements: Acknowledgements) => Promise<void>) => Promise<void>;
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
	askSave,
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
			askSave={askSave}
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
	askSave,
	map,
	mutations,
	onCancel,
	onSaved,
	registration,
	toolbarSlot,
}: {
	readonly askSave: RegistrationDraftProps['askSave'];
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
			// Closing the panel is *inside* the callback on purpose: `askSave`
			// resolves on a refusal as well as on a success, because a refusal is a
			// question rather than a failure. Closing on the way past would read as a
			// save that worked.
			await askSave(async (acknowledgements) => {
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
					acknowledgedFutureOnlyChange: acknowledgements.acknowledgedFutureOnlyChange === true,
					acknowledgedHistoricalContactChange:
						acknowledgements.acknowledgedHistoricalContactChange === true,
				});
				await reconcileSubscriptions({
					chosen: values.notificationTypeIds,
					current: subscriptions,
					mutations,
					registrationId: registration.id,
					acknowledgedFutureOnlyChange: acknowledgements.acknowledgedFutureOnlyChange === true,
				});
				onSaved('Registration updated.');
			});
		},
		[askSave, mutations, onSaved, registration, subscriptions],
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
		<div className="grid gap-5">
			<DraftForm
				canSubmit={mutations.canWrite}
				defaultValues={formValuesOf(registration, subscriptions)}
				initialGeometry={(savedGeometry.geometry ?? null) as DraftGeometry}
				map={map}
				onCancel={onCancel}
				onSave={onSave}
				submitLabel="Save registration"
				toolbarSlot={toolbarSlot}
			/>
			{/*
			 * Outside the form, not in it. Every button inside a `<form>` submits
			 * unless it says otherwise, and the card's own buttons do not.
			 *
			 * The delete refuses while a mission notification names this
			 * registration, so the card states that before the button is pressed
			 * rather than after — which is the whole reason the registration is in
			 * the delete registry (#322).
			 */}
			<DangerZoneCard
				name="this registration"
				noun="registration"
				onDelete={() => mutations.remove(registration.id)}
				onDeleted={() => onSaved('Registration removed.')}
				recordId={registration.id}
				recordType="notificationRegistration"
			/>
		</div>
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
	onSave,
	submitLabel,
	toolbarSlot,
}: {
	readonly canSubmit: boolean;
	readonly defaultValues: RegistrationFormValues;
	readonly initialGeometry: DraftGeometry;
	readonly map: MapboxMap | null;
	readonly onCancel: () => void;
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
 * Saving and cancelling only. Removing a saved registration is the danger zone
 * card below the form, which reads the server's delete policy first and says
 * what is stopping it; this row used to carry a Remove button that asked
 * nothing and found out afterwards.
 */
function DraftActions({
	canSubmit,
	form,
	onCancel,
	submitLabel,
}: {
	readonly canSubmit: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly onCancel: () => void;
	readonly submitLabel: string;
}) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
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
