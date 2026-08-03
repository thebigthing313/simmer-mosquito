import {
	expandFormulationApplicationCommands,
	recordChemicalApplicationCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	EquipmentRow,
	FormulationInsecticideRow,
	FormulationRow,
	InsecticideBatchRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
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
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { RequiredMark } from '../../../components/required-mark';
import { useAppForm } from '../../../forms';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import {
	customFieldCount,
	customSchemaFor,
	type FieldOption,
	type MetadataValue,
	validateSchemaMetadata,
} from '../../../forms/field-components';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import { webCollections } from '../../../sync/webCollections';
import { insecticideDisplayName, todayDateValue } from '../-control-display';
import { FormSection } from '../-control-form-parts';
import { AddressPicker, HabitatPicker } from '../-control-pickers';
import {
	componentAmounts,
	formatAmountValue,
	formatAmountWithUnit,
	sortedComponents,
} from './-formulation-math';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noSelectionValue = 'none';

/** Shared empty list, so an unselected formulation keeps a stable identity. */
const NO_COMPONENTS: readonly FormulationInsecticideRow[] = [];

/** Domain issue path → the form field holding it. */
const APPLICATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	insecticideId: 'insecticideId',
	amountApplied: 'amountApplied',
	applicationUnitId: 'applicationUnitId',
	applicationDate: 'applicationDate',
	applicatorProfileId: 'applicatorProfileId',
	applicationMethodId: 'applicationMethodId',
	vehicleId: 'vehicleId',
	equipmentId: 'equipmentId',
	addressId: 'addressId',
	metadata: 'metadata',
};

/**
 * The same map for a formulation entry, where the product and the amount are the
 * mix's. Anything the expansion reports per component (`components.0.ratio`) has
 * no field of its own and lands on the form alert.
 */
const FORMULATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	...APPLICATION_FIELD_PATHS,
	insecticideId: 'formulationId',
	totalAmount: 'amountApplied',
	batchSize: 'formulationId',
	components: 'formulationId',
};

/**
 * Amounts are recorded as a product quantity, so only the unit types a chemical
 * treatment can be measured in are offered (matching the insecticide catalog's
 * default-usage-unit choices).
 */
function isApplicationUnitType(unitType: UnitRow['unitType']): boolean {
	return unitType === 'volume' || unitType === 'weight' || unitType === 'count';
}

/**
 * Whether the operator is entering one product or a saved mix.
 *
 * A formulation is a calculator, not a record: choosing one splits the total
 * into an ordinary single-insecticide application per component product. Nothing
 * downstream stores which mix it came from (see `docs/control-operations-domain.md`).
 */
export type ApplicationProductMode = 'insecticide' | 'formulation';

export interface ApplicationFormValues {
	readonly productMode: ApplicationProductMode;
	/** An insecticide id, or '' when unset (placeholder shown). Single-product entry. */
	readonly insecticideId: string;
	/** A formulation id, or '' when unset. Formulation entry. */
	readonly formulationId: string;
	/** The amount that went out — of the product, or of the whole mix. */
	readonly amountApplied: number | null;
	/** A unit id, or '' when unset. Defaults from the chosen insecticide. */
	readonly applicationUnitId: string;
	/** `YYYY-MM-DD` — the day the application was made. */
	readonly applicationDate: string;
	/** `noSelectionValue` or an application method id. */
	readonly applicationMethodId: string;
	/** `noSelectionValue` or the applicator's profile id. */
	readonly applicatorProfileId: string;
	/** Profile ids of everyone else who worked this application. */
	readonly additionalPersonnelIds: readonly string[];
	/** Ids of the applied product's lots this treatment drew from. */
	readonly insecticideBatchIds: readonly string[];
	/** Lots per component product, keyed by insecticide id. Formulation entry. */
	readonly componentBatchIds: Readonly<Record<string, readonly string[]>>;
	/** `noSelectionValue` or a vehicle id. */
	readonly vehicleId: string;
	/** `noSelectionValue` or an equipment id. */
	readonly equipmentId: string;
	/**
	 * Optional address the application was made at — reference data only. The
	 * application's own point (its geometry) is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat this treatment was performed against. */
	readonly habitatId: string | null;
	/** Values for the custom fields the chosen application method declares. */
	readonly metadata: MetadataValue;
}

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
	readonly applicationMethods: readonly ControlMethodRow[];
	readonly insecticides: readonly InsecticideRow[];
	/**
	 * The agency's saved mixes. Passing them turns on formulation entry — leave
	 * them out where a single application row is being edited, since the record
	 * itself only ever holds one product.
	 */
	readonly formulations?: readonly FormulationRow[];
	/** Every mix's component rows; the chosen mix's are picked out of these. */
	readonly formulationComponents?: readonly FormulationInsecticideRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
	readonly vehicles: readonly VehicleRow[];
	readonly equipment: readonly EquipmentRow[];
	readonly defaultValues: ApplicationFormValues;
	/** The application's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so the record keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	readonly header: ApplicationFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: ApplicationFormValues;
		/** The application's geometry. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user drew, moved, or cleared the geometry this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultApplicationFormValues(): ApplicationFormValues {
	return {
		productMode: 'insecticide',
		insecticideId: '',
		formulationId: '',
		amountApplied: null,
		applicationUnitId: '',
		applicationDate: todayDateValue(),
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
		additionalPersonnelIds: [],
		insecticideBatchIds: [],
		componentBatchIds: {},
		vehicleId: noSelectionValue,
		equipmentId: noSelectionValue,
		addressId: null,
		habitatId: null,
		metadata: null,
	};
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
	header,
	submitLabel,
	onSave,
}: ApplicationFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleGeometryChange = useCallback((next: DrawGeometry | null) => {
		setGeometry(next);
		setGeometryChanged(true);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
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

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const insecticideOptions = useMemo(
		() => lifecycleOptions(insecticides, (row) => row.isActive, insecticideDisplayName),
		[insecticides],
	);
	const methodOptions = useMemo(
		() =>
			lifecycleOptions(
				applicationMethods,
				(row) => row.isActive,
				(row) => row.name,
			),
		[applicationMethods],
	);
	const profileOptions = useMemo(
		() =>
			lifecycleOptions(
				profiles,
				(row) => row.isActive,
				(row) => row.displayName,
			),
		[profiles],
	);
	const vehicleOptions = useMemo(
		() =>
			lifecycleOptions(
				vehicles,
				(row) => row.isActive,
				(row) => row.vehicleName,
			),
		[vehicles],
	);
	const equipmentOptions = useMemo(
		() =>
			lifecycleOptions(
				equipment,
				(row) => row.isActive,
				(row) => row.equipmentName,
			),
		[equipment],
	);
	const unitTypeById = useMemo(
		() => new Map(units.map((unit) => [unit.id, unit.unitType])),
		[units],
	);
	// A product is measured one way — a pound of granules is never four fluid
	// ounces — so the unit list narrows to the kind its default unit is in. Until
	// a product is chosen (or if its default unit is missing) every unit a
	// treatment can be measured in stays on offer.
	const unitTypeFor = useCallback(
		(insecticideId: string): UnitRow['unitType'] | null => {
			const product = insecticides.find((row) => row.id === insecticideId);
			return product === undefined ? null : (unitTypeById.get(product.defaultUnitId) ?? null);
		},
		[insecticides, unitTypeById],
	);
	const applicationUnitOptionsFor = useCallback(
		(insecticideId: string) => {
			const unitType = unitTypeFor(insecticideId);
			return unitType === null
				? unitOptions(units, isApplicationUnitType)
				: unitOptions(units, (candidate) => candidate === unitType);
		},
		[units, unitTypeFor],
	);

	// Formulation entry is offered only where the caller supplied the catalog —
	// recording new work. Editing a saved application edits its one product.
	const formulationEntry = formulations !== undefined;
	const formulationOptions = useMemo(
		() =>
			formulations === undefined
				? []
				: lifecycleOptions(
						formulations,
						(row) => row.isActive,
						(row) => row.formulationName,
					),
		[formulations],
	);
	const formulationById = useMemo(
		() => new Map((formulations ?? []).map((row) => [row.id, row] as const)),
		[formulations],
	);
	const componentsByFormulation = useMemo(() => {
		const grouped = new Map<string, FormulationInsecticideRow[]>();
		for (const component of formulationComponents ?? []) {
			const bucket = grouped.get(component.formulationId);
			if (bucket === undefined) {
				grouped.set(component.formulationId, [component]);
			} else {
				bucket.push(component);
			}
		}
		return grouped;
	}, [formulationComponents]);
	const componentsFor = useCallback(
		(formulationId: string): readonly FormulationInsecticideRow[] =>
			componentsByFormulation.get(formulationId) ?? NO_COMPONENTS,
		[componentsByFormulation],
	);
	const formulationFor = useCallback(
		(formulationId: string): FormulationRow | undefined => formulationById.get(formulationId),
		[formulationById],
	);

	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }: { readonly value: ApplicationFormValues }) => {
				const locationSource = {
					kind: 'geometry',
					geometry: (geometry ?? null) as never,
				} as const;
				const shared = {
					...FORM_VALIDATION_CONTEXT,
					locationSource,
					applicationDate: value.applicationDate,
					applicatorProfileId:
						value.applicatorProfileId === noSelectionValue ? null : value.applicatorProfileId,
					applicationMethodId:
						value.applicationMethodId === noSelectionValue ? null : value.applicationMethodId,
					vehicleId: value.vehicleId === noSelectionValue ? null : value.vehicleId,
					equipmentId: value.equipmentId === noSelectionValue ? null : value.equipmentId,
					addressId: value.addressId,
					metadata: value.metadata,
				};
				// A mix is validated as what it becomes: the same expansion the save
				// runs, so a rule that would reject one of the generated applications
				// is reported here rather than after the first row lands.
				if (value.productMode === 'formulation') {
					return domainValidator(
						() =>
							expandFormulationApplicationCommands({
								...shared,
								totalAmount: value.amountApplied as number,
								batchSize: formulationFor(value.formulationId)?.batchSize ?? Number.NaN,
								components: componentsFor(value.formulationId).map((component, index) => ({
									insecticideId: component.insecticideId,
									amount: component.amount,
									unitId: component.unitId,
									applicationId: placeholderApplicationId(index),
								})),
							}),
						FORMULATION_FIELD_PATHS,
					)({ value });
				}
				return domainValidator(
					() =>
						recordChemicalApplicationCommand({
							...shared,
							applicationId: FORM_VALIDATION_CONTEXT.organizationId,
							insecticideId: value.insecticideId,
							amountApplied: value.amountApplied as number,
							applicationUnitId: value.applicationUnitId,
						}),
					APPLICATION_FIELD_PATHS,
				)({ value });
			},
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const invalid = validate(value, componentsFor(value.formulationId).length);
			if (invalid !== null) {
				setSaveError(invalid);
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Map where the product was applied.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save application.');
			}
		},
	});

	// Seeding from an address (or moving onto one) replaces the drawn shape with a
	// point, so the tool selector follows it.
	const placeAddressPoint = useCallback((point: DrawPoint) => {
		setGeometry(point);
		setGeometryType('Point');
		setGeometryChanged(true);
	}, []);
	const { addressCoord, selectAddress, moveToAddress } = useAddressPoint({
		geometry,
		onPlacePoint: placeAddressPoint,
	});

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const handleTypeChange = useCallback(
		(next: DrawGeometryType) => {
			setGeometryType(next);
			setGeometry(null);
			setGeometryChanged(true);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startDraw = useCallback(() => {
		setLocationError(null);
		start(geometryType);
	}, [geometryType, start]);

	const clearGeometry = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas controls={{ layers: false }} onMapReady={handleMapReady} />
					<DrawToolbar controller={draw} geometryType={geometryType} />
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={header.backParams ?? {}}
						to={header.backTo}
					>
						<ArrowLeftIcon aria-hidden="true" />
						{header.backLabel}
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							{header.title}
						</h1>
						<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<form.AppForm>
						<form
							className="grid gap-6"
							onSubmit={(event) => {
								event.preventDefault();
								void form.handleSubmit();
							}}
						>
							<form.FormErrorAlert title="Unable to Save Application" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Application</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<section
								aria-labelledby="application-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									locationError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="application-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										The geometry is where the product was applied — a point for a spot treatment, a
										line or area for a treated swath. An address is optional reference.
									</span>
								</div>

								<form.AppField name="addressId">
									{(field) => (
										<AddressPicker
											create={{ requestMapPoint }}
											label="Address"
											onSelect={(address) => {
												field.handleChange(address?.id ?? null);
												setLocationError(null);
												selectAddress(address);
											}}
											organizationId={organizationId}
											value={field.state.value}
										/>
									)}
								</form.AppField>

								<GeometryControl
									controller={draw}
									geometry={geometry}
									geometryType={geometryType}
									label="Geometry"
									required={requireLocation}
									onClear={clearGeometry}
									onDraw={startDraw}
									onTypeChange={handleTypeChange}
									organizationId={organizationId}
									{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

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
																// The unit follows the product's default usage unit unless
																// the user has explicitly chosen a different one — and
																// always when the one they chose measures a different kind
																// of quantity.
																const previous = insecticides.find(
																	(row) => row.id === previousValue,
																);
																const currentUnit = form.state.values.applicationUnitId;
																const unitIsDerived =
																	currentUnit === '' || currentUnit === previous?.defaultUnitId;
																const nextUnitType = unitTypeFor(next ?? '');
																const unitStillFits =
																	nextUnitType === null ||
																	unitTypeById.get(currentUnit) === nextUnitType;
																if (unitIsDerived || !unitStillFits) {
																	form.setFieldValue(
																		'applicationUnitId',
																		chosen?.defaultUnitId ?? '',
																	);
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

							<FormSection title="Work">
								<div className="grid gap-5 sm:grid-cols-2">
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
									<form.AppField name="applicationMethodId">
										{(field) => (
											<field.SelectField
												label="Application method"
												options={optionalOptions(methodOptions, 'No method')}
												placeholder="No method"
											/>
										)}
									</form.AppField>
									<form.AppField name="applicatorProfileId">
										{(field) => (
											<field.AutocompleteField
												emptyValue={noSelectionValue}
												label="Applicator"
												options={profileOptions}
												placeholder="Unassigned — search profiles"
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

							{/* Agencies attach their own fields to an application method; render
							    whichever the selected one declares, and nothing when it declares
							    none (including when no method is chosen). */}
							<form.Subscribe selector={(state) => state.values.applicationMethodId}>
								{(methodId) => {
									const schema = customSchemaFor(applicationMethods, methodId);
									if (customFieldCount(schema) === 0) {
										return null;
									}
									return (
										<FormSection title="Custom Fields">
											<form.AppField
												name="metadata"
												validators={{ onSubmit: validateSchemaMetadata(schema) }}
											>
												{(field) => (
													<field.MetadataField
														description="Extra details your agency collects for this method."
														mode={{ kind: 'schema', schema }}
													/>
												)}
											</form.AppField>
										</FormSection>
									);
								}}
							</form.Subscribe>

							<FormSection title="Context">
								<div className="grid gap-1.5">
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
									<p className="m-0 text-muted-foreground text-xs">
										Link the treatment to a known larval site. Leave it empty for standalone work.
									</p>
								</div>
							</FormSection>

							<div className="border-border/50 border-t pt-5">
								<form.FormActions>
									<form.ResetButton />
									<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
								</form.FormActions>
							</div>
						</form>
					</form.AppForm>
				</div>
			</div>
		</MapSplitPage>
	);
}

// --- controls ---------------------------------------------------------------

/**
 * What the chosen mix will be saved as: one application per component product,
 * each carrying its share of the total. The split is the domain's own, so this
 * is a preview of the rows, not an estimate of them.
 */
function FormulationBreakdown({
	components,
	formulation,
	insecticides,
	totalAmount,
	units,
}: {
	readonly components: readonly FormulationInsecticideRow[];
	readonly formulation: FormulationRow | undefined;
	readonly insecticides: readonly InsecticideRow[];
	readonly totalAmount: number | null;
	readonly units: readonly UnitRow[];
}) {
	if (formulation === undefined) {
		return null;
	}
	if (components.length === 0) {
		return (
			<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-sm">
				This mix has no products in it. Add one under Formulations before recording against it.
			</p>
		);
	}

	const ordered = sortedComponents(components);
	const amounts = componentAmounts({
		components: ordered,
		batchSize: formulation.batchSize,
		totalAmount,
	});
	const amountByInsecticide = new Map(
		(amounts ?? []).map((amount) => [amount.insecticideId, amount.amount] as const),
	);
	const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
	const batchLabel = formatAmountWithUnit(
		formulation.batchSize,
		unitById.get(formulation.batchUnitId),
	);
	const batches = totalAmount === null ? null : totalAmount / formulation.batchSize;

	return (
		<div className="grid gap-2 rounded-md border border-border/50 bg-muted/30 p-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="font-medium text-foreground text-sm">
					Saves as {ordered.length} {ordered.length === 1 ? 'application' : 'applications'}
				</span>
				<span className="text-muted-foreground text-xs">
					{batches === null || !Number.isFinite(batches)
						? `One batch makes ${batchLabel}`
						: `${formatAmountValue(batches)} × ${batchLabel}`}
				</span>
			</div>
			<ul className="m-0 grid list-none gap-1 p-0">
				{ordered.map((component) => {
					const unit = unitById.get(component.unitId);
					const applied = amountByInsecticide.get(component.insecticideId);
					return (
						<li className="flex items-baseline justify-between gap-3 text-sm" key={component.id}>
							<span className="min-w-0 truncate text-foreground">
								{productLabel(insecticides, component.insecticideId)}
							</span>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatAmountWithUnit(component.amount, unit)} per batch
								{applied === undefined ? null : (
									<>
										{' · '}
										<span className="font-medium text-foreground text-sm">
											{formatAmountWithUnit(applied, unit)}
										</span>
									</>
								)}
							</span>
						</li>
					);
				})}
			</ul>
			{amounts === null ? (
				<p className="m-0 text-muted-foreground text-xs">
					Enter the total to see what each product works out to.
				</p>
			) : null}
		</div>
	);
}

// insecticide_batches is on-demand (docs/sync.md); keep a product's subset warm
// briefly so flipping between products does not refetch each time.
const batchOptionsGcTimeMs = 30_000;

/**
 * The chosen product's lots, as picker options. They sync on demand, so the list
 * comes from a live subset scoped to that product rather than a client-side
 * filter over an eager set — which is why this sits in its own component,
 * mounted only once a product is chosen.
 */
function InsecticideBatchOptions({
	insecticideId,
	children,
}: {
	readonly insecticideId: string;
	readonly children: (options: readonly FieldOption[]) => ReactNode;
}) {
	const result = useLiveQuery(
		{
			gcTime: batchOptionsGcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.insecticideBatches })
					.where(({ batch }) => eq(batch.insecticideId, insecticideId))
					.orderBy(({ batch }) => batch.batchName, 'asc'),
		},
		[insecticideId],
	);
	const batches = (result.data ?? []) as unknown as readonly InsecticideBatchRow[];
	// Spent and retired lots stay on offer, behind the ones still on the shelf —
	// an application being keyed in after the fact used whatever it used.
	const options = useMemo(
		() =>
			lifecycleOptions(
				batches,
				(batch) => batch.isActive,
				(batch) => batch.batchName,
			),
		[batches],
	);

	return <>{children(options)}</>;
}

function DateControl({
	label,
	value,
	required = false,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly required?: boolean;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">
				{label}
				{required ? <RequiredMark /> : null}
			</span>
			<DatePicker
				ariaLabel={label}
				className="w-full"
				onChange={(date) => onChange(date === undefined ? '' : formatLocalDate(date))}
				placeholder="Select date"
				value={parseLocalDate(value)}
			/>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

/** Prepend the "not set" sentinel every optional select needs. */
function optionalOptions(
	options: readonly FieldOption[],
	emptyLabel: string,
): readonly FieldOption[] {
	return [{ label: emptyLabel, value: noSelectionValue }, ...options];
}

function validate(values: ApplicationFormValues, componentCount: number): string | null {
	const mixed = values.productMode === 'formulation';
	if (mixed) {
		if (values.formulationId === '') {
			return 'Select the formulation that was applied.';
		}
		if (componentCount === 0) {
			return 'This formulation has no products to record against.';
		}
	} else if (values.insecticideId === '') {
		return 'Select the insecticide that was applied.';
	}
	if (
		values.amountApplied === null ||
		!Number.isFinite(values.amountApplied) ||
		values.amountApplied <= 0
	) {
		return mixed ? 'Enter the total amount of mix applied.' : 'Enter the amount applied.';
	}
	if (values.applicationUnitId === '') {
		return 'Select the unit the amount was measured in.';
	}
	if (values.applicationDate === '') {
		return 'Enter the date this application was made.';
	}
	return null;
}

/** A component product's name, for a label or a breakdown row. */
function productLabel(insecticides: readonly InsecticideRow[], insecticideId: string): string {
	const insecticide = insecticides.find((row) => row.id === insecticideId);
	return insecticide === undefined ? 'Unknown insecticide' : insecticideDisplayName(insecticide);
}

/**
 * A well-formed stand-in id per generated application, so the expansion runs its
 * real rules during validation. The save mints the ids that are actually stored.
 */
function placeholderApplicationId(index: number): string {
	return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

/** Parse a `YYYY-MM-DD` string to a local Date, or undefined when empty/invalid. */
function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [yearPart, monthPart, dayPart] = value.slice(0, 10).split('-');
	if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
		return undefined;
	}
	const year = Number.parseInt(yearPart, 10);
	const month = Number.parseInt(monthPart, 10);
	const day = Number.parseInt(dayPart, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Format a local Date back to a `YYYY-MM-DD` string. */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
