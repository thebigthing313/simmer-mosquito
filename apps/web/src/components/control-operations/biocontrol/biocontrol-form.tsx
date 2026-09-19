import { isBiocontrolUnitType, recordBiocontrolActionCommand } from '@simmer-mosquito/domain';
import {
	FormSection,
	type MetadataValue,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { SchemaCatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	validationLocationSource,
} from '../../../lib/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { todayInTimeZone } from '../../../lib/local-date';
import { noTechnicianValue, technicianOptions } from '../../../lib/no-technician';
import { unitOptions } from '../../../lib/unit-options';
import { additionalPersonnelOptions } from '../../additional-personnel';
import { DateControl } from '../../date-control';
import { CustomFieldsSection } from '../../forms/custom-fields-section';
import { FirstCommentSection } from '../../forms/first-comment-section';
import { LocationAddressField, LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';
import { locationDescription } from '../../map/location-description';
import { HabitatPicker } from '../control-pickers';

/** Domain issue path → the form field holding it. */
const BIOCONTROL_FIELD_PATHS: Readonly<Record<string, string>> = {
	biocontrolMethodId: 'biocontrolMethodId',
	amountReleased: 'amountReleased',
	releaseUnitId: 'releaseUnitId',
	biocontrolDate: 'biocontrolDate',
	technicianProfileId: 'technicianProfileId',
	addressId: 'addressId',
	metadata: 'metadata',
};

/**
 * The form's rules, straight from the domain builder: the method, the amount,
 * the unit and the date, each issue attributed to the field that holds it.
 */
export function validateBiocontrol(
	value: BiocontrolFormValues,
	geometry: DrawGeometry | null,
	requireLocation: boolean,
) {
	return domainValidator(
		() =>
			recordBiocontrolActionCommand({
				...FORM_VALIDATION_CONTEXT,
				biocontrolActionId: FORM_VALIDATION_CONTEXT.organizationId,
				locationSource: validationLocationSource(geometry, requireLocation),
				biocontrolMethodId: value.biocontrolMethodId,
				amountReleased: value.amountReleased as number,
				releaseUnitId: value.releaseUnitId,
				biocontrolDate: value.biocontrolDate,
				technicianProfileId:
					value.technicianProfileId === noTechnicianValue ? null : value.technicianProfileId,
				addressId: value.addressId,
				metadata: value.metadata,
			}),
		BIOCONTROL_FIELD_PATHS,
	)({ value });
}

export interface BiocontrolFormValues {
	/**
	 * Optional address the release happened at, reference data only. The action's
	 * own point is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat the agents were released into. */
	readonly habitatId: string | null;
	/** A biocontrol method id, or '' when unset (placeholder shown). */
	readonly biocontrolMethodId: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/** Profile ids of everyone else who worked this release. */
	readonly additionalPersonnelIds: readonly string[];
	/** `YYYY-MM-DD`: the date the agents were released. */
	readonly biocontrolDate: string;
	readonly amountReleased: number | null;
	/** A unit id, or '' when unset (placeholder shown). */
	readonly releaseUnitId: string;
	/** Values for the custom fields the chosen method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the action's first comment. Ignored on edit. */
	readonly comment: string;
}

export interface BiocontrolFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/control-operations/biocontrol' | '/control-operations/biocontrol/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface BiocontrolFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly biocontrolMethods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly defaultValues: BiocontrolFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
	readonly header: BiocontrolFormHeader;
	readonly onSave: (input: {
		readonly values: BiocontrolFormValues;
		/** The action's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultBiocontrolFormValues(timeZone: string): BiocontrolFormValues {
	return {
		addressId: null,
		habitatId: null,
		biocontrolMethodId: '',
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		biocontrolDate: todayInTimeZone(timeZone),
		amountReleased: null,
		releaseUnitId: '',
		metadata: null,
		comment: '',
	};
}

export function BiocontrolFormPage({
	organizationId,
	canSubmit,
	biocontrolMethods,
	units,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	mode,
	header,
	onSave,
}: BiocontrolFormPageProps) {
	// `referenceGeometry` is a habitat's shape, shown for context; the draw layer
	// renders the action's own geometry.
	const location = useDrawLocation({
		geometryKind: 'controlAction',
		initialGeometry,
		missingMessage: 'Map where the agents were released.',
		required: requireLocation,
	});
	const { draw, geometry, geometryType, referenceGeometry } = location;

	const methodOptions = lifecycleOptions(
		biocontrolMethods,
		(method) => method.isActive,
		(method) => method.name,
	);
	// Biocontrol releases are counted, measured by volume, or weighed, the domain
	// rejects any other unit type.
	const releaseUnitOptions = unitOptions(units, isBiocontrolUnitType);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: BiocontrolFormValues }) =>
				validateBiocontrol(value, geometry, requireLocation),
		},
		onSubmit: async ({ value }) => {
			location.clearError();
			if (!location.requireGeometry()) {
				return;
			}
			await onSave({ values: value, geometry, geometryChanged: location.geometryChanged });
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
						<MapCanvas geoJson={referenceGeometry} onMapReady={location.onMapReady} />
						<DrawToolbar
							geometryKind="controlAction"
							controller={draw}
							geometryType={geometryType}
						/>
					</>
				}
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to Save Biocontrol Action" />

				<form.AppField name="biocontrolDate">
					{(field) => (
						<DateControl
							label="Release date"
							required
							onChange={(next) => field.handleChange(next)}
							value={field.state.value}
						/>
					)}
				</form.AppField>

				<FormSection title="Personnel">
					<form.AppField name="technicianProfileId">
						{(field) => (
							<field.SelectField
								label="Technician"
								options={technicianOptions(profiles)}
								placeholder="Unassigned"
							/>
						)}
					</form.AppField>
					<form.Subscribe selector={(state) => state.values.technicianProfileId}>
						{(technicianProfileId) => (
							<form.AppField name="additionalPersonnelIds">
								{(field) => (
									<field.MultiSelectField
										emptyMessage="No profiles"
										label="Additional personnel"
										options={additionalPersonnelOptions(profiles, field.state.value, {
											excludeProfileId:
												technicianProfileId === noTechnicianValue ? null : technicianProfileId,
										})}
										placeholder="Search profiles"
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
				</FormSection>

				<LocationBand
					below={
						<form.AppField name="habitatId">
							{(field) => (
								<HabitatPicker
									label="Habitat"
									organizationId={organizationId}
									onSelect={(habitat) => {
										field.handleChange(habitat?.id ?? null);
										// The habitat is larval context, not the action's location; framing the
										// map on it seeds unplaced geometry.
										location.selectReference(
											habitat === null ? null : { lat: habitat.latitude, lng: habitat.longitude },
										);
									}}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					}
					description={locationDescription({
						geometryKind: 'controlAction',
						subject: 'The geometry is where the agents were released.',
						habitat: true,
					})}
					geometryKind="controlAction"
					location={location}
					organizationId={organizationId}
					required={requireLocation}
				>
					<form.AppField name="addressId">
						{(field) => (
							<LocationAddressField
								location={location}
								onChange={field.handleChange}
								value={field.state.value}
							/>
						)}
					</form.AppField>
				</LocationBand>

				<FormSection title="Release">
					<form.AppField name="biocontrolMethodId">
						{(field) => (
							<field.SelectField
								label="Biocontrol method"
								required
								options={methodOptions}
								placeholder="Select method"
							/>
						)}
					</form.AppField>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="amountReleased">
							{(field) => (
								<field.NumberField
									label="Amount released"
									required
									min={0}
									placeholder="e.g. 250"
								/>
							)}
						</form.AppField>
						<form.AppField name="releaseUnitId">
							{(field) => (
								<field.SelectField
									label="Unit"
									required
									options={releaseUnitOptions}
									placeholder="Select unit"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>

				<CustomFieldsSection
					catalog={biocontrolMethods}
					form={form}
					schemaField="biocontrolMethodId"
				/>

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- helpers ----------------------------------------------------------------

/**
 * What the form holds, as the write seam takes it. The "Unassigned" sentinel
 * stops here.
 */
export function biocontrolFieldsFrom(values: BiocontrolFormValues) {
	return {
		methodId: values.biocontrolMethodId,
		technicianProfileId:
			values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
		actionDate: values.biocontrolDate,
		addressId: values.addressId,
		habitatId: values.habitatId,
		amountReleased: values.amountReleased ?? 0,
		unitId: values.releaseUnitId,
		metadata: values.metadata,
	};
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';
