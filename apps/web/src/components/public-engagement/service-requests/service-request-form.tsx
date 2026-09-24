import { REQUEST_INTAKE_TYPES, type RequestIntakeType } from '@simmer-mosquito/domain';
import { FormSection, RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { DateControl } from '../../date-control';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';
import type { AddressOption } from '../../pickers/address-picker';
import { ContactSection } from './service-request-contact-section';
import {
	type ServiceRequestFormValues,
	validateServiceRequest,
} from './service-request-form-values';
import { RequestLocation } from './service-request-location';

const INTAKE_TYPE_OPTIONS = REQUEST_INTAKE_TYPES.map((value: RequestIntakeType) => ({
	value,
	label: value === 'walk-in' ? 'Walk-in' : value.charAt(0).toUpperCase() + value.slice(1),
}));

export interface ServiceRequestSaveInput {
	readonly values: ServiceRequestFormValues;
	/** The request's own point. Always set on create; null when location is locked. */
	readonly geometry: DrawGeometry | null;
}

export interface ServiceRequestFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo:
		| '/public-engagement/service-requests'
		| '/public-engagement/service-requests/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface ServiceRequestFormPageProps {
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
	readonly onSave: (input: ServiceRequestSaveInput) => Promise<void>;
}

export function ServiceRequestFormPage({
	canSubmit,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	hideLocation = false,
	disableNewContact = false,
	header,
	onSave,
}: ServiceRequestFormPageProps) {
	// The draw layer both renders the placed point and edits it, so the map needs no
	// separate preview feature.
	const location = useDrawLocation({
		geometryKind: 'serviceRequest',
		initialGeometry,
		missingMessage: 'Place the request location on the map.',
		required: requireLocation && !hideLocation,
	});
	const { addressCoord, draw, geometry, geometryType } = location;

	const profileOptions = lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);

	const { clearError, selectAddress } = location;
	const handleAddressSelected = (address: AddressOption | null) => {
		clearError();
		selectAddress(address);
	};

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: (input: { readonly value: ServiceRequestFormValues }) =>
				validateServiceRequest(input.value, geometry, { hideLocation, disableNewContact }),
		},
		onSubmit: async ({ value }) => {
			location.clearError();
			if (!location.requireGeometry()) {
				return;
			}
			await onSave({ values: value, geometry: hideLocation ? null : geometry });
		},
	});

	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<form.ResetButton />
						<form.SubmitButton disabled={!canSubmit} />
					</>
				}
				header={header}
				aside={
					<>
						<MapCanvas onMapReady={location.onMapReady} />
						<DrawToolbar
							geometryKind="serviceRequest"
							controller={draw}
							geometryType={geometryType}
							pointPrompt="Click the map to place the request location."
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Service Request" />

				<ContactSection disableNewContact={disableNewContact} form={form} />

				{hideLocation ? null : (
					<RequestLocation
						addressCoord={addressCoord}
						controller={draw}
						form={form}
						geometry={geometry}
						geometryType={geometryType}
						locationError={location.locationError}
						onAddressSelected={handleAddressSelected}
						onClearPoint={location.clear}
						onDrawPoint={location.startDraw}
						onMoveToAddress={location.moveToAddress}
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
