import { FormSection } from '@simmer-mosquito/ui-web/components/form';
import { useRecordForm } from '../../../hooks/forms/use-record-form';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { MissionStopGeometry } from '../../../hooks/operations/use-mission-stop-geometry';
import type { SchemaCatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type {
	FormulationComponentListing,
	FormulationListing,
	InsecticideListing,
	RigListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { UnitLabel, UnitType } from '../../../hooks/queries/use-unit-labels';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import { additionalPersonnelOptions } from '../../additional-personnel';
import { DateControl } from '../../date-control';
import { CustomFieldsSection } from '../../forms/custom-fields-section';
import { FirstCommentSection } from '../../forms/first-comment-section';
import { LocationAddressField, LocationBand } from '../../forms/location-band';
import { RecordFormFrame } from '../../forms/record-form-frame';
import { insecticideDisplayName } from '../control-display';
import { HabitatPicker } from '../control-pickers';
import {
	groupComponentsByFormulation,
	isApplicationUnitType,
	NO_COMPONENTS,
	noSelectionValue,
	optionalOptions,
	type TreatmentFormValues,
	validateTreatment,
} from './treatment-form-values';
import type { TreatmentRecipe } from './treatment-line-values';
import { TreatmentProductsSection } from './treatment-products-section';
import { treatmentSaveRefusal } from './treatment-save-refusal';

export interface TreatmentFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: '/control-operations/chemical' | '/control-operations/chemical/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface TreatmentFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly applicationMethods: readonly SchemaCatalogListing[];
	readonly insecticides: readonly InsecticideListing[];
	/** The Organization's saved mixes, for formulation entry. */
	readonly formulations: readonly FormulationListing[];
	/** Every mix's component rows; the chosen mix's are picked out of these. */
	readonly formulationComponents: readonly FormulationComponentListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly vehicles: readonly RigListing[];
	readonly equipment: readonly RigListing[];
	readonly defaultValues: TreatmentFormValues;
	/** The Treatment's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so the record keeps its existing shape unless the user redraws.
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
	readonly header: TreatmentFormHeader;
	readonly onSave: (input: {
		readonly values: TreatmentFormValues;
		/** The recipe the values were entered against, under formulation entry. */
		readonly recipe: TreatmentRecipe;
		/** The Treatment's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

/**
 * The Treatment form: the visit's facts entered once, and its products, product
 * by product or from a Formulation. Takes the catalogs every field picks from,
 * the defaults, the location rules and `onSave`, which receives the values and
 * the recipe they were entered against.
 */
export function TreatmentFormPage({
	organizationId,
	canSubmit,
	applicationMethods,
	insecticides,
	formulations,
	formulationComponents,
	units,
	profiles,
	vehicles,
	equipment,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	missionStop,
	mode,
	header,
	onSave,
}: TreatmentFormPageProps) {
	const location = useDrawLocation({
		geometryKind: 'controlAction',
		initialGeometry,
		missingMessage: 'Map where the products were applied.',
		required: requireLocation,
		missionStop,
	});
	const { geometry } = location;

	const insecticideOptions = lifecycleOptions(
		insecticides,
		(row) => row.isActive,
		insecticideDisplayName,
	);
	const methodOptions = lifecycleOptions(
		applicationMethods,
		(row) => row.isActive,
		(row) => row.name,
	);
	const profileOptions = lifecycleOptions(
		profiles,
		(row) => row.isActive,
		(row) => row.displayName,
	);
	const vehicleOptions = lifecycleOptions(
		vehicles,
		(row) => row.isActive,
		(row) => row.name,
	);
	const equipmentOptions = lifecycleOptions(
		equipment,
		(row) => row.isActive,
		(row) => row.name,
	);
	const formulationOptions = lifecycleOptions(
		formulations,
		(row) => row.isActive,
		(row) => row.formulationName,
	);
	const unitTypeById = new Map(units.map((unit) => [unit.id, unit.unitType]));
	// A row's units narrow to the kind its product's default unit is in. Until a
	// product is chosen every unit a treatment can be measured in stays on offer.
	const unitOptionsFor = (insecticideId: string) => {
		const product = insecticides.find((row) => row.id === insecticideId);
		const unitType: UnitType | null =
			product === undefined ? null : (unitTypeById.get(product.defaultUnitId) ?? null);
		return unitType === null
			? unitOptions(units, isApplicationUnitType)
			: unitOptions(units, (candidate) => candidate === unitType);
	};

	const componentsByFormulation = groupComponentsByFormulation(formulationComponents);
	const recipeFor = (formulationId: string): TreatmentRecipe => ({
		formulation: formulations.find((row) => row.id === formulationId),
		components: componentsByFormulation.get(formulationId) ?? NO_COMPONENTS,
	});

	const form = useRecordForm({
		defaultValues,
		validate: ({ value }: { readonly value: TreatmentFormValues }) =>
			validateTreatment(value, geometry, recipeFor(value.formulationId), insecticides),
		location,
		onSubmit: async (value) => {
			try {
				await onSave({
					values: value,
					recipe: recipeFor(value.formulationId),
					geometry,
					geometryChanged: location.geometryChanged,
				});
			} catch (error) {
				// A refusal naming a row lands on that row; a recipe the server no
				// longer agrees with recomputes the rows. Either way the alert says it.
				const refusal = treatmentSaveRefusal(error, value, recipeFor);
				if (refusal.lines !== null) {
					form.setFieldValue('lines', refusal.lines);
				}
				if (Object.keys(refusal.fields).length > 0) {
					form.setErrorMap({ onSubmit: { fields: refusal.fields } as never });
				}
				throw refusal.error;
			}
		},
	});

	return (
		<RecordFormFrame
			canSubmit={canSubmit}
			errorTitle="Unable to Save Treatment"
			form={form}
			header={header}
			map={{
				location,
				geometryKind: 'controlAction',
			}}
		>
			<form.AppField name="applicationDate">
				{(field) => (
					<DateControl
						errors={field.state.meta.errors}
						label="Application date"
						required
						onChange={field.handleChange}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<FormSection title="Personnel">
				<form.AppField name="applicatorProfileId">
					{(field) => (
						<field.AutocompleteField
							emptyValue={noSelectionValue}
							label="Applicator"
							options={profileOptions}
							placeholder="Search profiles, or leave unassigned"
						/>
					)}
				</form.AppField>
				<form.Subscribe selector={(state) => state.values.applicatorProfileId}>
					{(applicatorProfileId) => (
						<form.AppField name="additionalPersonnelIds">
							{(field) => (
								<field.MultiSelectField
									emptyMessage="No profiles"
									label="Additional personnel"
									options={additionalPersonnelOptions(profiles, field.state.value, {
										excludeProfileId:
											applicatorProfileId === noSelectionValue ? null : applicatorProfileId,
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
								errors={field.state.meta.errors}
								label="Habitat"
								organizationId={organizationId}
								onSelect={(habitat) => field.handleChange(habitat?.id ?? null)}
								value={field.state.value}
							/>
						)}
					</form.AppField>
				}
				geometryKind="controlAction"
				location={location}
				organizationId={organizationId}
				required={requireLocation}
			>
				<form.AppField name="addressId">
					{(field) => (
						<LocationAddressField
							errors={field.state.meta.errors}
							location={location}
							onChange={field.handleChange}
							value={field.state.value}
						/>
					)}
				</form.AppField>
			</LocationBand>

			<TreatmentProductsSection
				form={form}
				formulationOptions={formulationOptions}
				insecticideOptions={insecticideOptions}
				insecticides={insecticides}
				recipeFor={recipeFor}
				unitOptionsFor={unitOptionsFor}
				units={units}
			/>

			<FormSection title="Work Performed">
				<div className="grid gap-5 @md/fields:grid-cols-2">
					<form.AppField name="applicationMethodId">
						{(field) => (
							<field.SelectField
								label="Application method"
								options={optionalOptions(methodOptions, 'No method')}
								placeholder="No method"
							/>
						)}
					</form.AppField>
					<form.AppField name="vehicleId">
						{(field) => (
							<field.SelectField
								label="Vehicle"
								options={optionalOptions(vehicleOptions, 'No vehicle')}
								placeholder="No vehicle"
							/>
						)}
					</form.AppField>
					<form.AppField name="equipmentId">
						{(field) => (
							<field.SelectField
								label="Equipment"
								options={optionalOptions(equipmentOptions, 'No equipment')}
								placeholder="No equipment"
							/>
						)}
					</form.AppField>
				</div>
			</FormSection>

			<CustomFieldsSection
				catalog={applicationMethods}
				form={form}
				schemaField="applicationMethodId"
			/>

			<FirstCommentSection form={form} mode={mode} />
		</RecordFormFrame>
	);
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';
