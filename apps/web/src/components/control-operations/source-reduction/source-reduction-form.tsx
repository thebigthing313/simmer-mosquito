import { isSourceReductionUnitType, recordSourceReductionCommand } from '@simmer-mosquito/domain';
import {
	FormSection,
	type MetadataValue,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { MissionStopGeometry } from '../../../hooks/operations/use-mission-stop-geometry';
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
const SOURCE_REDUCTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	sourceReductionMethodId: 'sourceReductionMethodId',
	sourcesEliminatedAmount: 'sourcesEliminatedAmount',
	sourcesEliminatedUnitId: 'sourcesEliminatedUnitId',
	sourceReductionDate: 'sourceReductionDate',
	technicianProfileId: 'technicianProfileId',
	addressId: 'addressId',
	metadata: 'metadata',
};

/**
 * The form's rules, straight from the domain builder: the method, the amount,
 * the unit and the date, each issue attributed to the field that holds it.
 */
export function validateSourceReduction(
	value: SourceReductionFormValues,
	geometry: DrawGeometry | null,
) {
	return domainValidator(
		() =>
			recordSourceReductionCommand({
				...FORM_VALIDATION_CONTEXT,
				sourceReductionId: FORM_VALIDATION_CONTEXT.organizationId,
				locationSource: validationLocationSource(geometry),
				sourceReductionMethodId: value.sourceReductionMethodId,
				sourcesEliminatedAmount: value.sourcesEliminatedAmount as number,
				sourcesEliminatedUnitId: value.sourcesEliminatedUnitId,
				sourceReductionDate: value.sourceReductionDate,
				technicianProfileId:
					value.technicianProfileId === noTechnicianValue ? null : value.technicianProfileId,
				addressId: value.addressId,
				metadata: value.metadata,
			}),
		SOURCE_REDUCTION_FIELD_PATHS,
	)({ value });
}

export interface SourceReductionFormValues {
	/** A source reduction method id, or '' when unset (placeholder shown). */
	readonly sourceReductionMethodId: string;
	/** How many sources the crew eliminated; null until the field is filled in. */
	readonly sourcesEliminatedAmount: number | null;
	/** A unit id, or '' when unset (placeholder shown). */
	readonly sourcesEliminatedUnitId: string;
	/** `YYYY-MM-DD`: the operational date the work was performed. */
	readonly sourceReductionDate: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/** Profile ids of everyone else who worked this source reduction. */
	readonly additionalPersonnelIds: readonly string[];
	/**
	 * Optional address the work was done at, reference data only. The action's
	 * own point is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat whose breeding sources were eliminated. */
	readonly habitatId: string | null;
	/** Values for the custom fields the chosen method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the action's first comment. Ignored on edit. */
	readonly comment: string;
}

export interface SourceReductionFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo:
		| '/control-operations/source-reduction'
		| '/control-operations/source-reduction/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface SourceReductionSaveInput {
	readonly values: SourceReductionFormValues;
	/** The action's geometry. Always set on create; may be unchanged on edit. */
	readonly geometry: DrawGeometry | null;
	/** True when the user drew, moved, or cleared the geometry this session. */
	readonly geometryChanged: boolean;
}

export interface SourceReductionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly methods: readonly SchemaCatalogListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly defaultValues: SourceReductionFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	/**
	 * The mission stop the form was opened from, whose geometry is drawn when it
	 * arrives. Null off a stop and on edit; required so a create route that
	 * forgets the stop fails `tsc` rather than opening on an empty map.
	 */
	readonly missionStop: MissionStopGeometry | null;
	/** Create shows the first-comment box; edit does not (the thread owns it). */
	readonly mode: 'create' | 'edit';
	readonly header: SourceReductionFormHeader;
	readonly onSave: (input: SourceReductionSaveInput) => Promise<void>;
}

export function defaultSourceReductionFormValues(timeZone: string): SourceReductionFormValues {
	return {
		sourceReductionMethodId: '',
		sourcesEliminatedAmount: null,
		sourcesEliminatedUnitId: '',
		sourceReductionDate: todayInTimeZone(timeZone),
		technicianProfileId: noTechnicianValue,
		additionalPersonnelIds: [],
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
	};
}

export function SourceReductionFormPage({
	organizationId,
	canSubmit,
	methods,
	units,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	missionStop,
	mode,
	header,
	onSave,
}: SourceReductionFormPageProps) {
	// `referenceGeometry` is a habitat's shape, shown for context; the draw layer
	// renders the action's own geometry.
	const location = useDrawLocation({
		geometryKind: 'controlAction',
		initialGeometry,
		missingMessage: 'Map where the sources were eliminated.',
		required: requireLocation,
		missionStop,
	});
	const { draw, geometry, geometryType, referenceGeometry } = location;

	const methodOptions = lifecycleOptions(
		methods,
		(method) => method.isActive,
		(method) => method.name,
	);
	// The domain restricts source-reduction amounts to count/distance/area/volume.
	const amountUnitOptions = unitOptions(units, isSourceReductionUnitType);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: SourceReductionFormValues }) =>
				validateSourceReduction(value, geometry),
		},
		// A save refused over the fields says the missing location in the same
		// pass, rather than only once the fields are fixed.
		onSubmitInvalid: () => {
			location.requireGeometry();
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
				<form.FormErrorAlert title="Unable to Save Source Reduction" />

				<form.AppField name="sourceReductionDate">
					{(field) => (
						<DateControl
							label="Date performed"
							required
							onChange={field.handleChange}
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
											habitat === null ||
												typeof habitat.latitude !== 'number' ||
												typeof habitat.longitude !== 'number'
												? null
												: { lat: habitat.latitude, lng: habitat.longitude },
										);
									}}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					}
					description={locationDescription({
						geometryKind: 'controlAction',
						subject: 'The geometry is where the sources were eliminated.',
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

				<FormSection title="Work Performed">
					<form.AppField name="sourceReductionMethodId">
						{(field) => (
							<field.SelectField
								description="How the crew physically eliminated the breeding sources."
								label="Method"
								required
								options={methodOptions}
								placeholder="Select method"
							/>
						)}
					</form.AppField>
					<div className="grid gap-5 sm:grid-cols-2">
						<form.AppField name="sourcesEliminatedAmount">
							{(field) => (
								<field.NumberField
									label="Sources eliminated"
									required
									min={0}
									placeholder="e.g. 12"
								/>
							)}
						</form.AppField>
						<form.AppField name="sourcesEliminatedUnitId">
							{(field) => (
								<field.SelectField
									label="Unit"
									required
									options={amountUnitOptions}
									placeholder="Select unit"
								/>
							)}
						</form.AppField>
					</div>
				</FormSection>

				<CustomFieldsSection catalog={methods} form={form} schemaField="sourceReductionMethodId" />

				<FirstCommentSection form={form} mode={mode} />
			</RecordFormPage>
		</form.AppForm>
	);
}

// --- controls ---------------------------------------------------------------

// --- validation + helpers ---------------------------------------------------

/**
 * What the form holds, as the write seam takes it. The "Unassigned" sentinels
 * stop here.
 */
export function sourceReductionFieldsFrom(values: SourceReductionFormValues) {
	return {
		methodId: values.sourceReductionMethodId,
		technicianProfileId:
			values.technicianProfileId === noTechnicianValue ? null : values.technicianProfileId,
		actionDate: values.sourceReductionDate,
		addressId: values.addressId,
		habitatId: values.habitatId,
		sourcesEliminated: values.sourcesEliminatedAmount ?? 0,
		unitId: values.sourcesEliminatedUnitId,
		metadata: values.metadata,
	};
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';
