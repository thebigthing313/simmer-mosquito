import { isSourceReductionUnitType } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	AddressRow,
	ControlMethodRow,
	HabitatRow,
	ProfileRow,
	UnitRow,
} from '@simmer-mosquito/sync';
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
export const noTechnicianValue = 'none';

export interface SourceReductionFormValues {
	/** A source reduction method id, or '' when unset (placeholder shown). */
	readonly sourceReductionMethodId: string;
	/** How many sources the crew eliminated; null until the field is filled in. */
	readonly sourcesEliminatedAmount: number | null;
	/** A unit id, or '' when unset (placeholder shown). */
	readonly sourcesEliminatedUnitId: string;
	/** `YYYY-MM-DD` — the operational date the work was performed. */
	readonly sourceReductionDate: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/**
	 * Optional address the work was done at — reference data only. The action's own
	 * point (its geometry) is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat whose breeding sources were eliminated. */
	readonly habitatId: string | null;
	/** Values for the custom fields the chosen method declares. */
	readonly metadata: MetadataValue;
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
	readonly methods: readonly ControlMethodRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: SourceReductionFormValues;
	/** The action's geometry to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/**
	 * Whether geometry must be set to submit. Create requires it; edit leaves it
	 * optional so an action keeps its existing shape unless the user redraws.
	 */
	readonly requireLocation?: boolean;
	readonly header: SourceReductionFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: SourceReductionSaveInput) => Promise<void>;
}

export function defaultSourceReductionFormValues(): SourceReductionFormValues {
	return {
		sourceReductionMethodId: '',
		sourcesEliminatedAmount: null,
		sourcesEliminatedUnitId: '',
		sourceReductionDate: todayDateValue(),
		technicianProfileId: noTechnicianValue,
		addressId: null,
		habitatId: null,
		metadata: null,
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
	header,
	submitLabel,
	onSave,
}: SourceReductionFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryType, setGeometryType] = useState<DrawGeometryType>(
		initialGeometry?.type ?? 'Point',
	);
	const [geometryChanged, setGeometryChanged] = useState(false);
	// A habitat's shape, shown alongside the action's own geometry for context —
	// never the action's geometry itself, which the draw layer renders.
	const [referenceGeometry, setReferenceGeometry] = useState<GeoJsonGeometry | null>(null);
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

	// The action's own geometry is framed last so it wins when a habitat pick and
	// a geometry change land on the same render.
	useFitToGeometry(map, referenceGeometry, draw.isDrawing);
	useFitToGeometry(map, geometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const activeMethods = useMemo(() => methods.filter((method) => method.isActive), [methods]);
	const activeProfiles = useMemo(() => profiles.filter((profile) => profile.isActive), [profiles]);
	// The domain restricts source-reduction amounts to count/distance/area/volume.
	const amountUnitOptions = useMemo(() => unitOptions(units, isSourceReductionUnitType), [units]);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const validationError = validate(value);
			if (validationError !== null) {
				setSaveError(validationError);
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Map where the sources were eliminated.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(
					error instanceof Error ? error.message : 'Unable to save source reduction action.',
				);
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

	// The habitat is larval context, not the action's location — but framing the map
	// on it (and seeding unplaced geometry) saves the crew a pan across the county.
	const handleHabitatSelected = useCallback(
		(habitat: HabitatRow | null) => {
			if (habitat === null || typeof habitat.lat !== 'number' || typeof habitat.lng !== 'number') {
				setReferenceGeometry(null);
				return;
			}
			const point: DrawGeometry = { type: 'Point', coordinates: [habitat.lng, habitat.lat] };
			if (geometry === null) {
				// Seeded as the action's own geometry, so it needs no reference copy.
				setGeometry(point);
				setGeometryType('Point');
				setGeometryChanged(true);
				setReferenceGeometry(null);
				return;
			}
			setReferenceGeometry(point as unknown as GeoJsonGeometry);
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
					<MapCanvas
						controls={{ layers: false }}
						geoJson={referenceGeometry as unknown as GeoJSON.GeoJSON | null}
						onMapReady={handleMapReady}
					/>
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
							<form.FormErrorAlert title="Unable to Save Source Reduction" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Source Reduction</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<section
								aria-labelledby="source-reduction-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									locationError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="source-reduction-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										The geometry is where the sources were eliminated — a point for a single site, a
										line or area for a treated stretch. An address is optional reference.
									</span>
								</div>

								<form.AppField name="addressId">
									{(field) => (
										<AddressPicker
											label="Address (optional)"
											onSelect={(address) => {
												field.handleChange(address?.id ?? null);
												handleAddressSelected(address);
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
									{...(addressCoord === null ? {} : { onMoveToAddress: moveToAddress })}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Work Performed">
								<form.AppField name="sourceReductionMethodId">
									{(field) => (
										<field.SelectField
											description="How the crew physically eliminated the breeding sources."
											label="Method"
											options={activeMethods.map((method) => ({
												label: method.name,
												value: method.id,
											}))}
											placeholder="Select method"
										/>
									)}
								</form.AppField>
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="sourcesEliminatedAmount">
										{(field) => (
											<field.NumberField label="Sources eliminated" min={0} placeholder="e.g. 12" />
										)}
									</form.AppField>
									<form.AppField name="sourcesEliminatedUnitId">
										{(field) => (
											<field.SelectField
												label="Unit"
												options={amountUnitOptions}
												placeholder="Select unit"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							{/* Agencies attach their own fields to a method; render whichever the
							    selected one declares, and nothing when it declares none. */}
							<form.Subscribe selector={(state) => state.values.sourceReductionMethodId}>
								{(methodId) => {
									const schema = customSchemaFor(methods, methodId);
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

							<FormSection title="Attribution">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="sourceReductionDate">
										{(field) => (
											<DateControl
												label="Date performed"
												onChange={field.handleChange}
												value={field.state.value}
											/>
										)}
									</form.AppField>
									<form.AppField name="technicianProfileId">
										{(field) => (
											<field.SelectField
												label="Technician (optional)"
												options={technicianOptions(activeProfiles)}
												placeholder="Unassigned"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							<FormSection title="Context">
								<div className="grid gap-1.5">
									<form.AppField name="habitatId">
										{(field) => (
											<HabitatPicker
												label="Habitat (optional)"
												organizationId={organizationId}
												onSelect={(habitat) => {
													field.handleChange(habitat?.id ?? null);
													handleHabitatSelected(habitat);
												}}
												value={field.state.value}
											/>
										)}
									</form.AppField>
									<p className="m-0 text-muted-foreground text-xs">
										Link the work to a known larval site so it shows on that habitat’s history.
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

// --- validation + helpers ---------------------------------------------------

/**
 * Context-free checks only — org ownership, referenced-row existence, and the
 * unit-type restriction are the server's call (docs/domain-command-contract.md).
 */
function validate(values: SourceReductionFormValues): string | null {
	if (values.sourceReductionMethodId === '') {
		return 'Select the source reduction method used.';
	}
	if (values.sourcesEliminatedAmount === null) {
		return 'Enter how many sources were eliminated.';
	}
	if (values.sourcesEliminatedAmount < 0) {
		return 'Sources eliminated cannot be negative.';
	}
	if (values.sourcesEliminatedUnitId === '') {
		return 'Select the unit the amount is measured in.';
	}
	if (values.sourceReductionDate === '') {
		return 'Enter the date this work was performed.';
	}
	return null;
}

function technicianOptions(profiles: readonly ProfileRow[]) {
	return [
		{ label: 'Unassigned', value: noTechnicianValue },
		...profiles.map((profile) => ({ label: profile.displayName, value: profile.id })),
	];
}

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

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
