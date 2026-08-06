import {
	createServiceRequestCommand,
	REQUEST_INTAKE_TYPES,
	type RequestIntakeType,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow, ProfileRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { DateControl } from '../../../components/date-control';
import { MapCanvas } from '../../../components/map';
import {
	DrawToolbar,
	GeometryControl,
	POINT_DRAW_TYPES,
	useFitToGeometry,
} from '../../../components/map/geometry-control';
import { type DrawPoint, useAddressPoint } from '../../../components/map/use-address-point';
import {
	type DrawGeometry,
	type MapDrawController,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { ContactPicker } from '../../../components/pickers/contact-picker';
import type { RequestMapPoint } from '../../../components/pickers/new-address-form';
import { useAppForm } from '../../../forms';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { RecordFormPage } from '../../../forms/form-components';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import {
	CONTACT_FIELD_PATHS,
	type ContactFormValues,
	defaultContactFormValues,
	validateContactForm,
} from '../-contact-fields';
import { ContactFieldsBlock } from '../-contact-fields-block';

export type ContactMode = 'existing' | 'new';

const INTAKE_TYPE_OPTIONS = REQUEST_INTAKE_TYPES.map((value: RequestIntakeType) => ({
	value,
	label: value === 'walk-in' ? 'Walk-in' : value.charAt(0).toUpperCase() + value.slice(1),
}));

export interface ServiceRequestFormValues {
	readonly intakeType: RequestIntakeType;
	readonly requestDate: string;
	readonly details: string;
	/** A profile id; defaults to the acting user. */
	readonly receivedByProfileId: string;
	readonly contactMode: ContactMode;
	readonly contactId: string | null;
	/** The inline "new contact" subform — the same fields the contact page owns. */
	readonly newContact: ContactFormValues;
	readonly addressId: string | null;
}

/**
 * Domain issue path → the form field holding it. The inline contact subform nests
 * under `contact.details`, matching the shape the builder validates.
 */
const SERVICE_REQUEST_FIELD_PATHS: Readonly<Record<string, string>> = {
	intakeType: 'intakeType',
	requestDate: 'requestDate',
	details: 'details',
	receivedByProfileId: 'receivedByProfileId',
	'contact.contactId': 'contactId',
	'location.address.addressId': 'addressId',
	...Object.fromEntries(
		CONTACT_FIELD_PATHS.map((field) => [`contact.details.${field}`, `newContact.${field}`]),
	),
};

/**
 * The create path's rules, straight from the domain builder: intake type, date,
 * details, and whichever of the contact/address subforms is in play.
 */
function validateServiceRequest(value: ServiceRequestFormValues, geometry: DrawGeometry | null) {
	return domainValidator(
		() =>
			createServiceRequestCommand({
				...FORM_VALIDATION_CONTEXT,
				serviceRequestId: FORM_VALIDATION_CONTEXT.organizationId,
				intakeType: value.intakeType,
				requestDate: value.requestDate,
				details: value.details,
				receivedByProfileId: value.receivedByProfileId === '' ? null : value.receivedByProfileId,
				contact:
					value.contactMode === 'existing'
						? { kind: 'existing', contactId: value.contactId ?? '' }
						: {
								kind: 'new',
								contactId: FORM_VALIDATION_CONTEXT.organizationId,
								details: value.newContact,
							},
				location: {
					geometry: (geometry ?? null) as never,
					address: { kind: 'existing', addressId: value.addressId ?? '' },
				},
			}),
		SERVICE_REQUEST_FIELD_PATHS,
	)({ value });
}

export interface ServiceRequestSaveInput {
	readonly values: ServiceRequestFormValues;
	/** The request's own point. Always set on create; null when location is locked. */
	readonly geometry: DrawGeometry | null;
}

export interface ServiceRequestFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo:
		| '/public-engagement/service-requests'
		| '/public-engagement/service-requests/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface ServiceRequestFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: ServiceRequestFormValues;
	/** Prefill the drawn point on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Whether a point must be placed to submit (create requires one). */
	readonly requireLocation?: boolean;
	/** Edit locks location: the address/point are fixed and their section is hidden. */
	readonly hideLocation?: boolean;
	/** Edit disables inline contact creation (existing contact only). */
	readonly disableNewContact?: boolean;
	readonly header: ServiceRequestFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: ServiceRequestSaveInput) => Promise<void>;
}

export function defaultServiceRequestFormValues(
	today: string,
	receivedByProfileId: string,
): ServiceRequestFormValues {
	return {
		intakeType: 'phone',
		requestDate: today,
		details: '',
		receivedByProfileId,
		contactMode: 'existing',
		contactId: null,
		newContact: defaultContactFormValues(),
		addressId: null,
	};
}

export function ServiceRequestFormPage({
	organizationId,
	canSubmit,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	hideLocation = false,
	disableNewContact = false,
	header,
	submitLabel,
	onSave,
}: ServiceRequestFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	// The draw layer both renders the placed point and edits it, so the map needs no
	// separate preview feature.
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: geometry,
		onChange: handleGeometryChange,
	});
	const { start, requestPoint } = draw;
	// The inline "create address" subform places its point against this form's own
	// map, so a new address can be sited without leaving the record being filled in.
	const requestMapPoint = useCallback(
		(options?: { readonly prompt?: string }) => requestPoint(options?.prompt),
		[requestPoint],
	);

	const profileOptions = useMemo(
		() =>
			lifecycleOptions(
				profiles,
				(profile) => profile.isActive,
				(profile) => profile.displayName,
			),
		[profiles],
	);

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const placeAddressPoint = useCallback((point: DrawPoint) => setGeometry(point), []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});
	const handleAddressSelected = useCallback(
		(address: AddressRow | null) => {
			setLocationError(null);
			selectAddress(address);
		},
		[selectAddress],
	);

	const startDraw = useCallback(() => {
		setLocationError(null);
		start('Point');
	}, [start]);

	const clearPoint = useCallback(() => setGeometry(null), []);

	const form = useAppForm({
		defaultValues,
		validators: {
			/*
			 * Skipped when the location is locked (the edit form does not own the
			 * point) — the builder requires one, and there would be no field to fix.
			 */
			onSubmit: (input: { readonly value: ServiceRequestFormValues }) =>
				hideLocation ? undefined : validateServiceRequest(input.value, geometry),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const error = validateServiceRequestForm(value, { hideLocation, disableNewContact });
			if (error !== null) {
				setSaveError(error);
				return;
			}
			if (!hideLocation && requireLocation && geometry === null) {
				setLocationError('Place the request location on the map.');
				return;
			}
			try {
				await onSave({ values: value, geometry: hideLocation ? null : geometry });
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save service request.');
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
				header={header}
				map={
					<>
						<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
						<DrawToolbar
							controller={draw}
							geometryType="Point"
							pointPrompt="Click the map to place the request location."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Service Request" />
				{saveError === null ? null : (
					<Alert variant="destructive">
						<AlertTitle>Unable to Save Service Request</AlertTitle>
						<AlertDescription>{saveError}</AlertDescription>
					</Alert>
				)}

				<ContactSection
					disableNewContact={disableNewContact}
					form={form}
					organizationId={organizationId}
				/>

				{hideLocation ? null : (
					<LocationSection
						addressCoord={addressCoord}
						controller={draw}
						form={form}
						geometry={geometry}
						locationError={locationError}
						onAddressSelected={handleAddressSelected}
						onClearPoint={clearPoint}
						onDrawPoint={startDraw}
						onMoveToAddress={moveToAddress}
						organizationId={organizationId}
						requestMapPoint={requestMapPoint}
						requireLocation={requireLocation}
					/>
				)}

				<FormSection title="Request">
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="intakeType">
							{(field) => (
								<field.SelectField
									label="Intake type"
									required
									options={INTAKE_TYPE_OPTIONS}
									placeholder="Select intake type"
								/>
							)}
						</form.AppField>
						<form.AppField name="requestDate">
							{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
							{(field: any) => (
								<DateControl
									label="Request date"
									required
									onChange={field.handleChange}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					</div>
					<form.AppField name="receivedByProfileId">
						{(field) => (
							<field.SelectField
								label="Received by"
								options={profileOptions}
								placeholder="Select a profile"
							/>
						)}
					</form.AppField>
					<form.AppField name="details">
						{(field) => (
							<field.TextareaField
								description="What the caller reported — location details, mosquito activity, standing water, etc."
								label="Details"
								required
								placeholder="Describe the request…"
								rows={4}
							/>
						)}
					</form.AppField>
				</FormSection>
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- sections ---------------------------------------------------------------

function ContactSection({
	form,
	organizationId,
	disableNewContact,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
	readonly disableNewContact: boolean;
}) {
	return (
		<FormSection title="Contact">
			{disableNewContact ? null : (
				<form.AppField name="contactMode">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<ToggleGroup
							aria-label="Contact source"
							className="w-full"
							onValueChange={(next: string) => {
								if (next === 'existing' || next === 'new') {
									field.handleChange(next);
								}
							}}
							size="sm"
							type="single"
							value={field.state.value}
							variant="outline"
						>
							<ToggleGroupItem className="flex-1 text-xs" value="existing">
								Existing contact
							</ToggleGroupItem>
							<ToggleGroupItem className="flex-1 text-xs" value="new">
								New contact
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				</form.AppField>
			)}

			<form.Subscribe
				selector={(state: { values: ServiceRequestFormValues }) => state.values.contactMode}
			>
				{(contactMode: ContactMode) =>
					contactMode === 'existing' || disableNewContact ? (
						<form.AppField name="contactId">
							{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
							{(field: any) => (
								<ContactPicker
									onSelect={(contact) => field.handleChange(contact?.id ?? null)}
									organizationId={organizationId}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					) : (
						<div className="grid gap-6 rounded-md border border-border/50 bg-muted/30 p-4">
							<ContactFieldsBlock form={form} headingLevel="h3" prefix="newContact." />
						</div>
					)
				}
			</form.Subscribe>
		</FormSection>
	);
}

function LocationSection({
	form,
	organizationId,
	geometry,
	controller,
	addressCoord,
	locationError,
	requireLocation,
	requestMapPoint,
	onAddressSelected,
	onDrawPoint,
	onMoveToAddress,
	onClearPoint,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
	readonly geometry: DrawGeometry | null;
	readonly controller: MapDrawController;
	readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	readonly locationError: string | null;
	readonly requireLocation: boolean;
	readonly requestMapPoint: RequestMapPoint;
	readonly onAddressSelected: (address: AddressRow | null) => void;
	readonly onDrawPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClearPoint: () => void;
}) {
	return (
		<FormSection title="Location">
			{/*
			 * One way in to a new address: the picker's own "Create Address", which
			 * geocodes the entry and can place its point on this form's map. The form
			 * used to carry a second, thinner set of address fields beside it that did
			 * neither, so which one an intake taker reached for decided whether the
			 * address came out geocoded.
			 */}
			<form.AppField name="addressId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<AddressPicker
						create={{ requestMapPoint }}
						onSelect={(address: AddressRow | null) => {
							field.handleChange(address?.id ?? null);
							onAddressSelected(address);
						}}
						organizationId={organizationId}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<section
				aria-label="Request point"
				className={cn(
					'grid gap-4 rounded-md border bg-muted/30 p-4',
					locationError === null ? 'border-border/50' : 'border-destructive/60',
				)}
			>
				<p className="m-0 text-muted-foreground text-xs">
					The point is the request’s exact location. Use an address to frame the map, then refine
					the point to the precise spot.
				</p>
				<GeometryControl
					allowedTypes={POINT_DRAW_TYPES}
					controller={controller}
					geometry={geometry}
					geometryType="Point"
					label="Point"
					required={requireLocation}
					onClear={onClearPoint}
					onDraw={onDrawPoint}
					{...(addressCoord === null ? {} : { onMoveToAddress })}
				/>
				{locationError === null ? null : (
					<p className="m-0 text-destructive text-sm">{locationError}</p>
				)}
			</section>
		</FormSection>
	);
}

// --- validation -------------------------------------------------------------

function validateServiceRequestForm(
	values: ServiceRequestFormValues,
	options: { readonly hideLocation: boolean; readonly disableNewContact: boolean },
): string | null {
	if (values.details.trim().length === 0) {
		return 'Enter the request details.';
	}
	if (values.receivedByProfileId.trim().length === 0) {
		return 'Select who received the request.';
	}

	if (values.contactMode === 'existing' || options.disableNewContact) {
		if (values.contactId === null) {
			return 'Select the contact for this request.';
		}
	} else {
		const contactError = validateContactForm(values.newContact);
		if (contactError !== null) {
			return contactError;
		}
	}

	if (!options.hideLocation && values.addressId === null) {
		return 'Select or create the address for this request.';
	}

	return null;
}

// --- controls ---------------------------------------------------------------

function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
	);
}
