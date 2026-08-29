import { createNotificationRegistrationCommand } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import {
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useId, useMemo, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../../components/map/use-address-point';
import {
	type DrawGeometry,
	type DrawGeometryType,
	type MapDrawController,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { type AddressOption, AddressPicker } from '../../../components/pickers/address-picker';
import { ContactPicker } from '../../../components/pickers/contact-picker';
import type { RequestMapPoint } from '../../../components/pickers/new-address-form';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { unitOptions } from '../../../lib/unit-options';

/**
 * What a form holds, which is strings where the command takes numbers and ids.
 *
 * `bufferDistance` is a string because that is what a number input produces, and
 * an empty one means no buffer rather than zero. Both halves of the buffer are
 * kept together for the same reason the command takes them together: a distance
 * with no unit is not a buffer.
 */
export interface RegistrationFormValues {
	readonly contactId: string | null;
	readonly addressId: string | null;
	readonly bufferDistance: string;
	readonly bufferUnitId: string;
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
	/** The notification types this registration wants telling about. */
	readonly notificationTypeIds: readonly string[];
}

export function defaultRegistrationFormValues(): RegistrationFormValues {
	return {
		contactId: null,
		addressId: null,
		bufferDistance: '',
		bufferUnitId: '',
		hasBees: false,
		isNoSpray: false,
		notificationTypeIds: [],
	};
}

/** The buffer as the write seam takes it: both halves, or neither. */
export function bufferFrom(
	values: RegistrationFormValues,
): { readonly distance: number; readonly unitId: string } | null {
	const distance = Number.parseFloat(values.bufferDistance);
	if (values.bufferDistance.trim() === '' || Number.isNaN(distance) || values.bufferUnitId === '') {
		return null;
	}
	return { distance, unitId: values.bufferUnitId };
}

/** Domain issue path to the form field holding it. */
const REGISTRATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	'contact.contactId': 'contactId',
	'location.address.addressId': 'addressId',
	'location.geometry': 'addressId',
	bufferDistance: 'bufferDistance',
	bufferUnitId: 'bufferUnitId',
};

/**
 * The create builder's rules, run against what the form holds.
 *
 * Worth running the real builder rather than restating its rules: the purpose
 * rule below is the one a form would get wrong, and it is not a field rule at
 * all. A registration has to be *for* something, and the three things it can be
 * for sit in two different sections, so no single field can carry the error.
 */
function validateRegistration(value: RegistrationFormValues, geometry: DrawGeometry | null) {
	return domainValidator(
		() =>
			createNotificationRegistrationCommand({
				...FORM_VALIDATION_CONTEXT,
				notificationRegistrationId: FORM_VALIDATION_CONTEXT.organizationId,
				contact: { kind: 'existing', contactId: value.contactId ?? '' },
				location: {
					address:
						value.addressId === null
							? { kind: 'none' }
							: { kind: 'existing', addressId: value.addressId },
					geometry: (geometry ?? null) as never,
				},
				bufferDistance: bufferFrom(value)?.distance ?? null,
				bufferUnitId: bufferFrom(value)?.unitId ?? null,
				hasBees: value.hasBees,
				isNoSpray: value.isNoSpray,
				subscriptions: value.notificationTypeIds.map((notificationTypeId) => ({
					notificationRegistrationTypeId: FORM_VALIDATION_CONTEXT.organizationId,
					notificationTypeId,
				})),
			}),
		REGISTRATION_FIELD_PATHS,
	)({ value });
}

export interface RegistrationSaveInput {
	readonly values: RegistrationFormValues;
	/** Null when the user did not redraw it, which an edit reads as "unchanged". */
	readonly geometry: DrawGeometry | null;
}

export interface RegistrationFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/public-engagement/registrations' | '/public-engagement/registrations/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface RegistrationFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly defaultValues: RegistrationFormValues;
	readonly initialGeometry?: DrawGeometry | null;
	readonly units: readonly UnitLabel[];
	readonly notificationTypes: readonly { readonly id: string; readonly label: string }[];
	readonly header: RegistrationFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: RegistrationSaveInput) => Promise<void>;
}

/**
 * Recording where somebody asked to be warned, and how far around it.
 *
 * The geometry is the registration, not a pin on a map of it: a beekeeper's
 * hives are a point, a market garden is a field, and a no-spray verge is a line.
 * All three are allowed, because generation measures from the shape.
 *
 * The buffer is what turns that shape into a catchment, and it is the field most
 * worth getting right: the unit list is filtered to distance units here, which
 * is the gap that let an unpriceable unit reach generation and refuse it for the
 * whole agency.
 */
export function RegistrationFormPage({
	organizationId,
	canSubmit,
	defaultValues,
	initialGeometry = null,
	units,
	notificationTypes,
	header,
	submitLabel,
	onSave,
}: RegistrationFormPageProps) {
	const [saveError, setSaveError] = useState<string | null>(null);
	const location = useRegistrationLocation(initialGeometry);
	const { draw, geometry, geometryType } = location;

	// Distance only. The domain checks this server-side too, but a select that
	// offers gallons is a select somebody eventually picks gallons from, and the
	// refusal it causes blocks generation for every mission in the agency.
	const bufferUnitOptions = useMemo(
		() => unitOptions(units, (unitType) => unitType === 'distance'),
		[units],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: (input: { readonly value: RegistrationFormValues }) =>
				validateRegistration(input.value, geometry),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			location.clearError();
			if (value.contactId === null) {
				setSaveError('Select the contact this registration is for.');
				return;
			}
			if (geometry === null) {
				location.setError('Draw the place this registration covers.');
				return;
			}
			try {
				await onSave({ values: value, geometry });
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save registration.');
			}
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
					</>
				}
				gap="tight"
				header={header}
				aside={
					<>
						<MapCanvas controls={{ layers: false }} onMapReady={location.onMapReady} />
						<DrawToolbar
							controller={draw}
							geometryType={geometryType}
							pointPrompt="Click the map to place this registration."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Registration" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Registration</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<ContactSection form={form} organizationId={organizationId} />

				<RegistrationLocation
					addressCoord={location.addressCoord}
					controller={draw}
					form={form}
					geometry={geometry}
					geometryType={geometryType}
					locationError={location.error}
					onAddressSelected={location.selectAddress}
					onClear={location.clear}
					onDraw={location.startDraw}
					onMoveToAddress={location.moveToAddress}
					onTypeChange={location.setGeometryType}
					organizationId={organizationId}
					requestMapPoint={location.requestMapPoint}
				/>

				<FormSection title="Buffer">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="bufferDistance">
							{(field) => (
								<field.TextField
									description="How far past the geometry the warning reaches. Leave empty to warn only for the geometry itself."
									inputMode="decimal"
									label="Distance"
									placeholder="e.g. 500"
								/>
							)}
						</form.AppField>
						<form.AppField name="bufferUnitId">
							{(field) => (
								<field.SelectField
									label="Unit"
									options={bufferUnitOptions}
									placeholder="Select a distance unit"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>

				<PurposeSection form={form} notificationTypes={notificationTypes} />
			</RecordFormPage>
		</form.AppForm>
	);
}

/**
 * Everything the map half of this form holds, as one controller.
 *
 * The pieces move each other — picking an address places the point, changing the
 * geometry type restarts the draw, drawing anything clears the location error —
 * so holding them as seven separate `useState` calls in the page makes the page
 * responsible for wiring that has nothing to do with the fields beside it. Same
 * reason `routes/operations/-location-section.tsx` puts geometry in a controller
 * rather than in form state.
 */
// Sixteen hooks, and every one of them is a piece of the same answer. This is
// the shape the habitat, inspection and service-request forms already hold their
// geometry in, all of which sit above the threshold in the saved baseline;
// splitting it further would separate controls that move each other.
// fallow-ignore-next-line complexity
function useRegistrationLocation(initialGeometry: DrawGeometry | null) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setType] = useState<DrawGeometryType>(initialGeometry?.type ?? 'Point');
	const [error, setError] = useState<string | null>(null);

	const onMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const onChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		if (next !== null) {
			setError(null);
		}
	}, []);

	const draw = useMapDraw({ map, isLoaded: map !== null, value: geometry, onChange });
	const { start, requestPoint, isDrawing } = draw;

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, isDrawing);

	const placePoint = useCallback((point: DrawPoint) => setGeometry(point), []);
	const { addressCoord, moveToAddress, selectAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placePoint,
	});

	const clearError = useCallback(() => setError(null), []);
	const clear = useCallback(() => setGeometry(null), []);

	const requestMapPoint = useCallback(
		(options?: { readonly prompt?: string }) => requestPoint(options?.prompt),
		[requestPoint],
	);

	const startDraw = useCallback(() => {
		setError(null);
		start(geometryType);
	}, [geometryType, start]);

	const setGeometryType = useCallback(
		(next: DrawGeometryType) => {
			setType(next);
			// Restart the draw in the new shape rather than leaving the toolbar
			// saying one thing while the map is still drawing another.
			if (isDrawing) {
				start(next);
			}
		},
		[isDrawing, start],
	);

	const pickAddress = useCallback(
		(option: AddressOption | null) => {
			setError(null);
			selectAddress(option);
		},
		[selectAddress],
	);

	return {
		addressCoord,
		clear,
		clearError,
		draw,
		error,
		geometry,
		geometryType,
		moveToAddress,
		onMapReady,
		requestMapPoint,
		selectAddress: pickAddress,
		setError,
		setGeometryType,
		startDraw,
	};
}

function ContactSection({
	form,
	organizationId,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
}) {
	return (
		<FormSection title="Contact">
			<form.AppField name="contactId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<ContactPicker
						onSelect={(contact: { readonly id: string } | null) =>
							field.handleChange(contact?.id ?? null)
						}
						organizationId={organizationId}
						value={field.state.value}
					/>
				)}
			</form.AppField>
		</FormSection>
	);
}

/**
 * Where the registration is, as the boxed band every located record uses.
 *
 * A box rather than a heading because the controls in it move each other:
 * picking an address can reframe the map and place the point, and changing the
 * geometry type replaces the shape. The border is what says they are one answer.
 */
function RegistrationLocation({
	addressCoord,
	controller,
	form,
	geometry,
	geometryType,
	locationError,
	onAddressSelected,
	onClear,
	onDraw,
	onMoveToAddress,
	onTypeChange,
	organizationId,
	requestMapPoint,
}: {
	readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	readonly controller: MapDrawController;
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly locationError: string | null;
	readonly onAddressSelected: (address: AddressOption | null) => void;
	readonly onClear: () => void;
	readonly onDraw: () => void;
	readonly onMoveToAddress: () => void;
	readonly onTypeChange: (next: DrawGeometryType) => void;
	readonly organizationId: string;
	readonly requestMapPoint: RequestMapPoint;
}) {
	return (
		<LocationSection
			description="The geometry is the place itself — a point for a house, a line for a verge, an area for a field. An address is optional reference."
			error={locationError}
		>
			<form.AppField name="addressId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<AddressPicker
						create={{ requestMapPoint }}
						onSelect={(address: AddressOption | null) => {
							field.handleChange(address?.id ?? null);
							onAddressSelected(address);
						}}
						organizationId={organizationId}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<GeometryControl
				controller={controller}
				geometry={geometry}
				geometryType={geometryType}
				label="Geometry"
				required
				onClear={onClear}
				onDraw={onDraw}
				onTypeChange={onTypeChange}
				organizationId={organizationId}
				{...(addressCoord === null ? {} : { onMoveToAddress })}
			/>
		</LocationSection>
	);
}

/**
 * What the registration is for, which is the one thing it cannot be without.
 *
 * The domain refuses a registration that is neither a bees warning, a no-spray
 * request, nor a subscription to anything, and those three sit in one section
 * because that rule is about all of them together. Split across two sections,
 * the refusal would arrive pointing at neither.
 */
function PurposeSection({
	form,
	notificationTypes,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly notificationTypes: readonly { readonly id: string; readonly label: string }[];
}) {
	const beesId = useId();
	const noSprayId = useId();

	return (
		<FormSection
			note="A registration needs at least one of these: a warning flag, or a notification type."
			title="What to warn about"
		>
			<div className="grid gap-3">
				<form.AppField name="hasBees">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<div className="flex items-start gap-3">
							<Checkbox
								checked={field.state.value}
								className="mt-0.5"
								id={beesId}
								onCheckedChange={(value) => field.handleChange(value === true)}
							/>
							<Label className="font-normal leading-snug" htmlFor={beesId}>
								Bees are kept here
							</Label>
						</div>
					)}
				</form.AppField>
				<form.AppField name="isNoSpray">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<div className="flex items-start gap-3">
							<Checkbox
								checked={field.state.value}
								className="mt-0.5"
								id={noSprayId}
								onCheckedChange={(value) => field.handleChange(value === true)}
							/>
							<Label className="font-normal leading-snug" htmlFor={noSprayId}>
								Do not spray here
							</Label>
						</div>
					)}
				</form.AppField>
			</div>

			<form.AppField name="notificationTypeIds">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<fieldset className="grid gap-3">
						<legend className="font-semibold text-foreground text-sm">Notification types</legend>
						{notificationTypes.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								This agency has no notification types yet.
							</p>
						) : (
							notificationTypes.map((type) => (
								<NotificationTypeCheckbox
									checked={field.state.value.includes(type.id)}
									key={type.id}
									label={type.label}
									onToggle={(checked) =>
										field.handleChange(
											checked
												? [...field.state.value, type.id]
												: field.state.value.filter((id: string) => id !== type.id),
										)
									}
								/>
							))
						)}
					</fieldset>
				)}
			</form.AppField>
		</FormSection>
	);
}

function NotificationTypeCheckbox({
	checked,
	label,
	onToggle,
}: {
	readonly checked: boolean;
	readonly label: string;
	readonly onToggle: (checked: boolean) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-start gap-3">
			<Checkbox
				checked={checked}
				className="mt-0.5"
				id={id}
				onCheckedChange={(value) => onToggle(value === true)}
			/>
			<Label className="font-normal leading-snug" htmlFor={id}>
				{label}
			</Label>
		</div>
	);
}
