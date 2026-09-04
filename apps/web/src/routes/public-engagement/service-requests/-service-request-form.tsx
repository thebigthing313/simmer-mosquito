import {
	createServiceRequestCommand,
	REQUEST_INTAKE_TYPES,
	type RequestIntakeType,
} from '@simmer-mosquito/domain';
import {
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useCallback, useMemo, useState } from 'react';
import { DateControl } from '../../../components/date-control';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar, GeometryControl } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import type { DrawGeometry, MapDrawController } from '../../../components/map/use-map-draw';
import type { AddressOption } from '../../../components/pickers/address-picker';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { ContactPicker } from '../../../components/pickers/contact-picker';
import type { RequestMapPoint } from '../../../components/pickers/new-address-form';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import type { ServiceRequestFields } from '../../../hooks/mutations/use-service-request-mutations';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import {
	CONTACT_FIELD_PATHS,
	type ContactFormValues,
	defaultContactFormValues,
	validateContactForm,
} from '../-contact-fields';
import { ContactFieldsBlock } from '../-contact-fields-block';

export type ContactMode = 'existing' | 'new';

/**
 * The form's values, as the write seam takes them.
 *
 * The boundary between what a form holds — strings, because that is what an
 * input produces — and what a command takes. An unset "received by" is the empty
 * string in a select and `null` in the column, and this is where that stops
 * being the route's problem to remember.
 */
export function serviceRequestFieldsFrom(values: ServiceRequestFormValues): ServiceRequestFields {
	return {
		intakeType: values.intakeType,
		requestDate: values.requestDate,
		details: values.details.trim(),
		receivedByProfileId:
			values.receivedByProfileId.length === 0 ? null : values.receivedByProfileId,
	};
}

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
	readonly profiles: readonly ProfileListing[];
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
	const [saveError, setSaveError] = useState<string | null>(null);
	// The draw layer both renders the placed point and edits it, so the map needs no
	// separate preview feature.
	const location = useDrawLocation({
		initialGeometry,
		missingMessage: 'Place the request location on the map.',
		required: requireLocation && !hideLocation,
	});
	const { addressCoord, draw, geometry } = location;

	const profileOptions = useMemo(
		() =>
			lifecycleOptions(
				profiles,
				(profile) => profile.isActive,
				(profile) => profile.displayName,
			),
		[profiles],
	);

	const { clearError, selectAddress } = location;
	const handleAddressSelected = useCallback(
		(address: AddressOption | null) => {
			clearError();
			selectAddress(address);
		},
		[clearError, selectAddress],
	);

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
			location.clearError();
			const error = validateServiceRequestForm(value, { hideLocation, disableNewContact });
			if (error !== null) {
				setSaveError(error);
				return;
			}
			if (!location.requireGeometry()) {
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
				aside={
					<>
						<MapCanvas controls={{ layers: false }} onMapReady={location.onMapReady} />
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
					<RequestLocation
						addressCoord={addressCoord}
						controller={draw}
						form={form}
						geometry={geometry}
						locationError={location.locationError}
						onAddressSelected={handleAddressSelected}
						onClearPoint={location.clear}
						onDrawPoint={location.startDraw}
						onMoveToAddress={location.moveToAddress}
						organizationId={organizationId}
						requestMapPoint={location.requestMapPoint}
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

function RequestLocation({
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
	readonly onAddressSelected: (address: AddressOption | null) => void;
	readonly onDrawPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClearPoint: () => void;
}) {
	return (
		<LocationSection
			description="The point is the request’s exact location. Use an address to frame the map, then refine the point to the precise spot."
			error={locationError}
		>
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
				geometryType="Point"
				geometryKind="serviceRequest"
				label="Point"
				required={requireLocation}
				onClear={onClearPoint}
				onDraw={onDrawPoint}
				{...(addressCoord === null ? {} : { onMoveToAddress })}
			/>
		</LocationSection>
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
