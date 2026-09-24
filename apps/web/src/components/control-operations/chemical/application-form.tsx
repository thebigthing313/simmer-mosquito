import { FormSection, RecordFormPage, useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
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
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';
import { locationDescription } from '../../map/location-description';
import { insecticideDisplayName } from '../control-display';
import { HabitatPicker } from '../control-pickers';
import {
	type ApplicationFormValues,
	groupComponentsByFormulation,
	isApplicationUnitType,
	NO_COMPONENTS,
	noSelectionValue,
	optionalOptions,
	productLabel,
	validateApplication,
} from './application-form-values';
import { FormulationBreakdown } from './formulation-breakdown';
import { InsecticideBatchOptions } from './insecticide-batch-options';

export interface ApplicationFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/control-operations/chemical' | '/control-operations/chemical/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface ApplicationFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly applicationMethods: readonly SchemaCatalogListing[];
	readonly insecticides: readonly InsecticideListing[];
	/**
	 * The organization's saved mixes. Passing them turns on formulation entry;
	 * leave them out where a single application row is being edited.
	 */
	readonly formulations?: readonly FormulationListing[];
	/** Every mix's component rows; the chosen mix's are picked out of these. */
	readonly formulationComponents?: readonly FormulationComponentListing[];
	readonly units: readonly UnitLabel[];
	readonly profiles: readonly ProfileListing[];
	readonly vehicles: readonly RigListing[];
	readonly equipment: readonly RigListing[];
	readonly defaultValues: ApplicationFormValues;
	/** The application's geometry to pre-fill on edit; create starts with none. */
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
	readonly header: ApplicationFormHeader;
	readonly onSave: (input: {
		readonly values: ApplicationFormValues;
		/** The application's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function ApplicationFormPage({
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
}: ApplicationFormPageProps) {
	const location = useDrawLocation({
		geometryKind: 'controlAction',
		initialGeometry,
		missingMessage: 'Map where the product was applied.',
		required: requireLocation,
		missionStop,
	});
	const { draw, geometry, geometryType } = location;

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
	const unitTypeById = new Map(units.map((unit) => [unit.id, unit.unitType]));
	// The unit list narrows to the kind the product's default unit is in. Until a
	// product is chosen every unit a treatment can be measured in stays on offer.
	const unitTypeFor = (insecticideId: string): UnitType | null => {
		const product = insecticides.find((row) => row.id === insecticideId);
		return product === undefined ? null : (unitTypeById.get(product.defaultUnitId) ?? null);
	};
	const applicationUnitOptionsFor = (insecticideId: string) => {
		const unitType = unitTypeFor(insecticideId);
		return unitType === null
			? unitOptions(units, isApplicationUnitType)
			: unitOptions(units, (candidate) => candidate === unitType);
	};

	// Formulation entry is offered only where the caller supplied the catalog —
	// recording new work. Editing a saved application edits its one product.
	const formulationEntry = formulations !== undefined;
	const formulationOptions =
		formulations === undefined
			? []
			: lifecycleOptions(
					formulations,
					(row) => row.isActive,
					(row) => row.formulationName,
				);
	const formulationById = new Map((formulations ?? []).map((row) => [row.id, row] as const));
	const componentsByFormulation = groupComponentsByFormulation(formulationComponents);
	const componentsFor = (formulationId: string): readonly FormulationComponentListing[] =>
		componentsByFormulation.get(formulationId) ?? NO_COMPONENTS;
	const formulationFor = (formulationId: string): FormulationListing | undefined =>
		formulationById.get(formulationId);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: ApplicationFormValues }) =>
				validateApplication(value, geometry, {
					batchSize: formulationFor(value.formulationId)?.batchSize ?? Number.NaN,
					components: componentsFor(value.formulationId),
				}),
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
						<MapCanvas onMapReady={location.onMapReady} />
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
				<form.FormErrorAlert title="Unable to Save Chemical Application" />

				<form.AppField name="applicationDate">
					{(field) => (
						<DateControl
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
									label="Habitat"
									organizationId={organizationId}
									onSelect={(habitat) => field.handleChange(habitat?.id ?? null)}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					}
					description={locationDescription({
						geometryKind: 'controlAction',
						subject: 'The geometry is where the product was applied.',
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

				<FormSection title="Product">
					{formulationEntry ? (
						<form.AppField name="productMode">
							{(field) => (
								<ToggleGroup
									aria-label="Product entry"
									className="w-full"
									onValueChange={(next) => {
										if (next !== 'insecticide' && next !== 'formulation') {
											return;
										}
										field.handleChange(next);
										// Each mode owns its own product and lots; leaving the
										// other mode's behind would silently save with them.
										if (next === 'formulation') {
											form.setFieldValue('insecticideId', '');
											form.setFieldValue('insecticideBatchIds', []);
										} else {
											form.setFieldValue('formulationId', '');
											form.setFieldValue('componentBatchIds', {});
										}
									}}
									size="sm"
									type="single"
									value={field.state.value}
									variant="outline"
								>
									<ToggleGroupItem className="flex-1 text-xs" value="insecticide">
										Single insecticide
									</ToggleGroupItem>
									<ToggleGroupItem className="flex-1 text-xs" value="formulation">
										Formulation
									</ToggleGroupItem>
								</ToggleGroup>
							)}
						</form.AppField>
					) : null}

					<form.Subscribe selector={(state) => state.values.productMode}>
						{(productMode) =>
							productMode === 'formulation' ? (
								<div className="grid gap-5">
									<form.AppField name="formulationId">
										{(field) => (
											<field.AutocompleteField
												emptyValue=""
												label="Formulation"
												required
												onValueChange={(next, previousValue) => {
													if (next === previousValue) {
														return;
													}
													// The amount is entered in whatever the mix is
													// batched in, so the unit comes from the mix.
													form.setFieldValue(
														'applicationUnitId',
														formulationFor(next ?? '')?.batchUnitId ?? '',
													);
													// Lots belong to the products in the mix, so
													// switching mixes starts them over.
													form.setFieldValue('componentBatchIds', {});
												}}
												options={formulationOptions}
												placeholder="Search formulations"
											/>
										)}
									</form.AppField>
									<div className="grid gap-5 sm:grid-cols-2">
										<form.AppField name="amountApplied">
											{(field) => (
												<field.NumberField
													description="Finished mix that went out, not product."
													label="Total mix applied"
													required
													min={0}
													placeholder="e.g. 78"
												/>
											)}
										</form.AppField>
										<form.AppField name="applicationUnitId">
											{(field) => (
												<field.SelectField
													description="Set by the mix."
													disabled
													label="Unit"
													required
													options={unitOptions(units, isApplicationUnitType)}
													placeholder="Pick a formulation first"
												/>
											)}
										</form.AppField>
									</div>
									<form.Subscribe
										selector={(state) =>
											[state.values.formulationId, state.values.amountApplied] as const
										}
									>
										{([formulationId, amountApplied]) => (
											<FormulationBreakdown
												components={componentsFor(formulationId)}
												formulation={formulationFor(formulationId)}
												insecticides={insecticides}
												totalAmount={amountApplied}
												units={units}
											/>
										)}
									</form.Subscribe>
									{/* Lots are per product, so a mix asks once for each of its own. */}
									<form.Subscribe selector={(state) => state.values.formulationId}>
										{(formulationId) =>
											componentsFor(formulationId).map((component) => (
												<form.AppField
													key={component.id}
													name={`componentBatchIds.${component.insecticideId}`}
												>
													{(field) => (
														<InsecticideBatchOptions insecticideId={component.insecticideId}>
															{(options) => (
																<field.MultiSelectField
																	emptyMessage="No batches for this product"
																	label={`${productLabel(insecticides, component.insecticideId)} batches`}
																	options={options}
																	placeholder="Search batches"
																/>
															)}
														</InsecticideBatchOptions>
													)}
												</form.AppField>
											))
										}
									</form.Subscribe>
								</div>
							) : (
								<div className="grid gap-5">
									<form.AppField name="insecticideId">
										{(field) => (
											<field.AutocompleteField
												emptyValue=""
												label="Insecticide"
												required
												onValueChange={(next, previousValue) => {
													const chosen = insecticides.find((row) => row.id === next);
													// The unit follows the product's default usage unit unless the user chose
													// one of the same kind.
													const previous = insecticides.find((row) => row.id === previousValue);
													const currentUnit = form.state.values.applicationUnitId;
													const unitIsDerived =
														currentUnit === '' || currentUnit === previous?.defaultUnitId;
													const nextUnitType = unitTypeFor(next ?? '');
													const unitStillFits =
														nextUnitType === null || unitTypeById.get(currentUnit) === nextUnitType;
													if (unitIsDerived || !unitStillFits) {
														form.setFieldValue('applicationUnitId', chosen?.defaultUnitId ?? '');
													}
													// Lots belong to one product, so changing the product
													// drops them.
													if (next !== previousValue) {
														form.setFieldValue('insecticideBatchIds', []);
													}
												}}
												options={insecticideOptions}
												placeholder="Search insecticides"
											/>
										)}
									</form.AppField>
									<div className="grid gap-5 sm:grid-cols-2">
										<form.AppField name="amountApplied">
											{(field) => (
												<field.NumberField
													description="Total product applied across the treated area."
													label="Amount applied"
													required
													min={0}
													placeholder="e.g. 12.5"
												/>
											)}
										</form.AppField>
										<form.Subscribe selector={(state) => state.values.insecticideId}>
											{(insecticideId) => (
												<form.AppField name="applicationUnitId">
													{(field) => (
														<field.SelectField
															label="Unit"
															required
															options={applicationUnitOptionsFor(insecticideId)}
															placeholder="Select unit"
														/>
													)}
												</form.AppField>
											)}
										</form.Subscribe>
									</div>
									{/* Lots are a property of the chosen product, so there is nothing to
												    offer until one is picked. */}
									<form.Subscribe selector={(state) => state.values.insecticideId}>
										{(insecticideId) =>
											insecticideId === '' ? null : (
												<form.AppField name="insecticideBatchIds">
													{(field) => (
														<InsecticideBatchOptions insecticideId={insecticideId}>
															{(options) => (
																<field.MultiSelectField
																	emptyMessage="No batches for this product"
																	label="Batches"
																	options={options}
																	placeholder="Search batches"
																/>
															)}
														</InsecticideBatchOptions>
													)}
												</form.AppField>
											)
										}
									</form.Subscribe>
								</div>
							)
						}
					</form.Subscribe>
				</FormSection>

				<FormSection title="Work Performed">
					<div className="grid gap-5 sm:grid-cols-2">
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
			</RecordFormPage>
		</form.AppForm>
	);
}

export type { DrawGeometry } from '../../../hooks/map/use-map-draw';
