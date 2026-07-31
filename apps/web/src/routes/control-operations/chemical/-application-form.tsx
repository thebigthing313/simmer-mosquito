import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	EquipmentRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
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
import { useAppForm } from '../../../forms';
import {
	customFieldCount,
	customSchemaFor,
	type FieldOption,
	type MetadataValue,
	validateSchemaMetadata,
} from '../../../forms/field-components';
import { insecticideDisplayName, todayDateValue, unitOptions } from '../-control-display';
import { FormSection } from '../-control-form-parts';
import { AddressPicker, HabitatPicker } from '../-control-pickers';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noSelectionValue = 'none';

/**
 * Amounts are recorded as a product quantity, so only the unit types a chemical
 * treatment can be measured in are offered (matching the insecticide catalog's
 * default-usage-unit choices).
 */
function isApplicationUnitType(unitType: UnitRow['unitType']): boolean {
	return unitType === 'volume' || unitType === 'weight' || unitType === 'count';
}

export interface ApplicationFormValues {
	/** An insecticide id, or '' when unset (placeholder shown). */
	readonly insecticideId: string;
	readonly amountApplied: number | null;
	/** A unit id, or '' when unset. Defaults from the chosen insecticide. */
	readonly applicationUnitId: string;
	/** `YYYY-MM-DD` — the day the application was made. */
	readonly applicationDate: string;
	/** `noSelectionValue` or an application method id. */
	readonly applicationMethodId: string;
	/** `noSelectionValue` or the applicator's profile id. */
	readonly applicatorProfileId: string;
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
		insecticideId: '',
		amountApplied: null,
		applicationUnitId: '',
		applicationDate: todayDateValue(),
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
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
	const { start } = draw;

	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	// Inactive catalog rows stay selectable when they are already on the record, so
	// editing an old application never silently drops its product or method.
	const insecticideOptions = useMemo(
		() =>
			selectableOptions(
				insecticides,
				defaultValues.insecticideId,
				(row) => row.isActive,
				insecticideDisplayName,
			),
		[insecticides, defaultValues.insecticideId],
	);
	const methodOptions = useMemo(
		() =>
			selectableOptions(
				applicationMethods,
				defaultValues.applicationMethodId,
				(row) => row.isActive,
				(row) => row.name,
			),
		[applicationMethods, defaultValues.applicationMethodId],
	);
	const profileOptions = useMemo(
		() =>
			selectableOptions(
				profiles,
				defaultValues.applicatorProfileId,
				(row) => row.isActive,
				(row) => row.displayName,
			),
		[profiles, defaultValues.applicatorProfileId],
	);
	const vehicleOptions = useMemo(
		() =>
			selectableOptions(
				vehicles,
				defaultValues.vehicleId,
				(row) => row.isActive,
				(row) => row.vehicleName,
			),
		[vehicles, defaultValues.vehicleId],
	);
	const equipmentOptions = useMemo(
		() =>
			selectableOptions(
				equipment,
				defaultValues.equipmentId,
				(row) => row.isActive,
				(row) => row.equipmentName,
			),
		[equipment, defaultValues.equipmentId],
	);
	const applicationUnitOptions = useMemo(() => unitOptions(units, isApplicationUnitType), [units]);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const invalid = validate(value);
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
											label="Address (optional)"
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
									label={requireLocation ? 'Geometry (required)' : 'Geometry'}
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
								<form.AppField name="insecticideId">
									{(field) => (
										<field.AutocompleteField
											emptyValue=""
											label="Insecticide"
											onValueChange={(next, previousValue) => {
												// The unit follows the product's default usage unit unless the
												// user has explicitly chosen a different one.
												const previous = insecticides.find((row) => row.id === previousValue);
												const currentUnit = form.state.values.applicationUnitId;
												const unitIsDerived =
													currentUnit === '' || currentUnit === previous?.defaultUnitId;
												if (unitIsDerived) {
													const chosen = insecticides.find((row) => row.id === next);
													form.setFieldValue('applicationUnitId', chosen?.defaultUnitId ?? '');
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
											<field.NumberField label="Amount applied" min={0} placeholder="e.g. 12" />
										)}
									</form.AppField>
									<form.AppField name="applicationUnitId">
										{(field) => (
											<field.SelectField
												label="Unit"
												options={applicationUnitOptions}
												placeholder="Select unit"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							<FormSection title="Work">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="applicationDate">
										{(field) => (
											<DateControl
												label="Application date"
												onChange={field.handleChange}
												value={field.state.value}
											/>
										)}
									</form.AppField>
									<form.AppField name="applicationMethodId">
										{(field) => (
											<field.SelectField
												label="Application method (optional)"
												options={optionalOptions(methodOptions, 'No method')}
												placeholder="No method"
											/>
										)}
									</form.AppField>
									<form.AppField name="applicatorProfileId">
										{(field) => (
											<field.AutocompleteField
												emptyValue={noSelectionValue}
												label="Applicator (optional)"
												options={profileOptions}
												placeholder="Unassigned — search profiles"
											/>
										)}
									</form.AppField>
									<form.AppField name="vehicleId">
										{(field) => (
											<field.SelectField
												label="Vehicle (optional)"
												options={optionalOptions(vehicleOptions, 'No vehicle')}
												placeholder="No vehicle"
											/>
										)}
									</form.AppField>
									<form.AppField name="equipmentId">
										{(field) => (
											<field.SelectField
												label="Equipment (optional)"
												options={optionalOptions(equipmentOptions, 'No equipment')}
												placeholder="No equipment"
											/>
										)}
									</form.AppField>
								</div>
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
												label="Habitat (optional)"
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

function DateControl({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
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

/**
 * Options for a catalog select: active rows, plus whatever the record already
 * references — a deactivated product or vehicle must stay visible on the row that
 * used it — sorted by label so long catalogs stay scannable.
 */
function selectableOptions<TRow extends { readonly id: string }>(
	rows: readonly TRow[],
	selectedId: string,
	isActive: (row: TRow) => boolean,
	toLabel: (row: TRow) => string,
): readonly FieldOption[] {
	return rows
		.filter((row) => isActive(row) || row.id === selectedId)
		.map((row) => ({ label: toLabel(row), value: row.id }))
		.sort((first, second) => first.label.localeCompare(second.label));
}

function validate(values: ApplicationFormValues): string | null {
	if (values.insecticideId === '') {
		return 'Select the insecticide that was applied.';
	}
	if (
		values.amountApplied === null ||
		!Number.isFinite(values.amountApplied) ||
		values.amountApplied <= 0
	) {
		return 'Enter the amount applied.';
	}
	if (values.applicationUnitId === '') {
		return 'Select the unit the amount was measured in.';
	}
	if (values.applicationDate === '') {
		return 'Enter the date this application was made.';
	}
	return null;
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
