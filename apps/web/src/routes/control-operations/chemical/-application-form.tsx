import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	AddressRow,
	ControlMethodRow,
	EquipmentRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
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
import {
	type DrawGeometry,
	type DrawGeometryType,
	useMapDraw,
} from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import {
	customFieldCount,
	customSchemaFor,
	type MetadataValue,
	validateSchemaMetadata,
} from '../../../forms/field-components';
import { todayDateValue, unitOptions } from '../-control-display';
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
	const [addressCoord, setAddressCoord] = useState<{
		readonly lat: number;
		readonly lng: number;
	} | null>(null);
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
	const insecticideChoices = useMemo(
		() => keepActiveAndSelected(insecticides, defaultValues.insecticideId, (row) => row.isActive),
		[insecticides, defaultValues.insecticideId],
	);
	const methodChoices = useMemo(
		() =>
			keepActiveAndSelected(
				applicationMethods,
				defaultValues.applicationMethodId,
				(row) => row.isActive,
			),
		[applicationMethods, defaultValues.applicationMethodId],
	);
	const profileChoices = useMemo(
		() => keepActiveAndSelected(profiles, defaultValues.applicatorProfileId, (row) => row.isActive),
		[profiles, defaultValues.applicatorProfileId],
	);
	const vehicleChoices = useMemo(
		() => keepActiveAndSelected(vehicles, defaultValues.vehicleId, (row) => row.isActive),
		[vehicles, defaultValues.vehicleId],
	);
	const equipmentChoices = useMemo(
		() => keepActiveAndSelected(equipment, defaultValues.equipmentId, (row) => row.isActive),
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

	// Selecting an address never overwrites geometry the user already drew — the
	// address is reference only. It just frames the map and, when nothing is drawn
	// yet, seeds a point at the address so the required geometry starts somewhere
	// sane.
	const handleAddressSelected = useCallback(
		(address: AddressRow | null) => {
			setLocationError(null);
			if (address === null || typeof address.lat !== 'number' || typeof address.lng !== 'number') {
				setAddressCoord(null);
				return;
			}
			const coord = { lat: address.lat, lng: address.lng };
			setAddressCoord(coord);
			if (geometry === null) {
				setGeometry({ type: 'Point', coordinates: [coord.lng, coord.lat] });
				setGeometryType('Point');
				setGeometryChanged(true);
			}
		},
		[geometry],
	);

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

	const moveToAddress = useCallback(() => {
		if (addressCoord === null) {
			return;
		}
		setGeometry({ type: 'Point', coordinates: [addressCoord.lng, addressCoord.lat] });
		setGeometryType('Point');
		setGeometryChanged(true);
	}, [addressCoord]);

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
				<header className="sticky top-0 z-10 grid gap-2 border-border/50 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
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

								<div className="grid gap-1.5">
									<span className="font-medium text-foreground text-sm">Address (optional)</span>
									<form.AppField name="addressId">
										{(field) => (
											<AddressPicker
												onSelect={(address) => {
													field.handleChange(address?.id ?? null);
													handleAddressSelected(address);
												}}
												organizationId={organizationId}
												value={field.state.value}
											/>
										)}
									</form.AppField>
								</div>

								<GeometryControl
									controller={draw}
									geometry={geometry}
									geometryType={geometryType}
									label={requireLocation ? 'Geometry (required)' : 'Geometry'}
									onClear={clearGeometry}
									onDraw={startDraw}
									onTypeChange={handleTypeChange}
									{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Product">
								<form.AppField name="insecticideId">
									{(field) => (
										<SelectControl
											label="Insecticide"
											onChange={(next) => {
												// The unit follows the product's default usage unit unless the
												// user has explicitly chosen a different one.
												const previous = insecticides.find((row) => row.id === field.state.value);
												const currentUnit = form.state.values.applicationUnitId;
												const unitIsDerived =
													currentUnit === '' || currentUnit === previous?.defaultUnitId;
												field.handleChange(next);
												if (unitIsDerived) {
													const chosen = insecticides.find((row) => row.id === next);
													form.setFieldValue('applicationUnitId', chosen?.defaultUnitId ?? '');
												}
											}}
											options={insecticideChoices.map((row) => ({
												label: insecticideLabel(row),
												value: row.id,
											}))}
											placeholder="Select insecticide"
											value={field.state.value}
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
												options={optionalOptions(
													methodChoices.map((row) => ({ label: row.name, value: row.id })),
													'No method',
												)}
												placeholder="No method"
											/>
										)}
									</form.AppField>
									<form.AppField name="applicatorProfileId">
										{(field) => (
											<field.SelectField
												label="Applicator (optional)"
												options={optionalOptions(
													profileChoices.map((row) => ({ label: row.displayName, value: row.id })),
													'Unassigned',
												)}
												placeholder="Unassigned"
											/>
										)}
									</form.AppField>
									<form.AppField name="vehicleId">
										{(field) => (
											<field.SelectField
												label="Vehicle (optional)"
												options={optionalOptions(
													vehicleChoices.map((row) => ({ label: row.vehicleName, value: row.id })),
													'No vehicle',
												)}
												placeholder="No vehicle"
											/>
										)}
									</form.AppField>
									<form.AppField name="equipmentId">
										{(field) => (
											<field.SelectField
												label="Equipment (optional)"
												options={optionalOptions(
													equipmentChoices.map((row) => ({
														label: row.equipmentName,
														value: row.id,
													})),
													'No equipment',
												)}
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

/**
 * A select whose change handler can touch sibling fields (the insecticide drives
 * the unit), which the shared `SelectField` does not expose.
 */
function SelectControl({
	label,
	options,
	placeholder,
	value,
	onChange,
}: {
	readonly label: string;
	readonly options: readonly { readonly label: string; readonly value: string }[];
	readonly placeholder: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<Select onValueChange={onChange} value={value}>
				<SelectTrigger aria-label={label} className="w-full">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

export function insecticideLabel(insecticide: InsecticideRow): string {
	return insecticide.shorthand ?? insecticide.tradeName;
}

/** Prepend the "not set" sentinel every optional select needs. */
function optionalOptions(
	options: readonly { readonly label: string; readonly value: string }[],
	emptyLabel: string,
): readonly { readonly label: string; readonly value: string }[] {
	return [{ label: emptyLabel, value: noSelectionValue }, ...options];
}

/**
 * Active rows, plus whatever the record already references — a deactivated
 * product or vehicle must stay visible on the row that used it.
 */
function keepActiveAndSelected<TRow extends { readonly id: string }>(
	rows: readonly TRow[],
	selectedId: string,
	isActive: (row: TRow) => boolean,
): readonly TRow[] {
	return rows.filter((row) => isActive(row) || row.id === selectedId);
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
