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
import { ArrowLeftIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import { todayDateValue, unitOptions } from '../-control-display';
import { FormSection, MapPrompt, PointControl, useFitToGeometry } from '../-control-form-parts';
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
	/** The action's point. Always set on create; may be unchanged on edit. */
	readonly geometry: DrawGeometry | null;
	/** True when the user placed, moved, or cleared the point this session. */
	readonly geometryChanged: boolean;
}

export interface SourceReductionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly methods: readonly ControlMethodRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: SourceReductionFormValues;
	/** The action's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/**
	 * Whether a point must be set to submit. Create requires one; edit leaves it
	 * optional so an action keeps its existing point unless the user refines it.
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
	initialPreviewGeometry = null,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: SourceReductionFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [geometryChanged, setGeometryChanged] = useState(false);
	const [previewGeometry, setPreviewGeometry] = useState<GeoJsonGeometry | null>(
		initialPreviewGeometry,
	);
	const [addressCoord, setAddressCoord] = useState<{
		readonly lat: number;
		readonly lng: number;
	} | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const draw = useMapDraw({ map, isLoaded: map !== null, value: null, onChange: () => undefined });
	const { requestPoint } = draw;

	useFitToGeometry(map, previewGeometry);

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
				setLocationError('Place the point where the sources were eliminated.');
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

	// Selecting an address never overwrites a point the user already placed — the
	// address is reference only. It just frames the map and, when no point exists
	// yet, seeds one at the address so the required geometry starts somewhere sane.
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
				setGeometryChanged(true);
				setPreviewGeometry({ type: 'Point', coordinates: [coord.lng, coord.lat] });
			}
		},
		[geometry],
	);

	// The habitat is larval context, not the action's location — but framing the map
	// on it (and seeding an unplaced point) saves the crew a pan across the county.
	const handleHabitatSelected = useCallback(
		(habitat: HabitatRow | null) => {
			if (habitat === null || typeof habitat.lat !== 'number' || typeof habitat.lng !== 'number') {
				return;
			}
			const point: DrawGeometry = { type: 'Point', coordinates: [habitat.lng, habitat.lat] };
			if (geometry === null) {
				setGeometry(point);
				setGeometryChanged(true);
			}
			setPreviewGeometry(point as unknown as GeoJsonGeometry);
		},
		[geometry],
	);

	const requestActionPoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the source reduction point.');
			setGeometry(point);
			setGeometryChanged(true);
			setPreviewGeometry(point as unknown as GeoJsonGeometry);
		} catch {
			// Draw cancelled (Esc / mode switch); keep the prior point.
		}
	}, [requestPoint]);

	const moveToAddress = useCallback(() => {
		if (addressCoord === null) {
			return;
		}
		const point: DrawGeometry = {
			type: 'Point',
			coordinates: [addressCoord.lng, addressCoord.lat],
		};
		setGeometry(point);
		setGeometryChanged(true);
		setPreviewGeometry(point as unknown as GeoJsonGeometry);
	}, [addressCoord]);

	const clearPoint = useCallback(() => {
		setGeometry(null);
		setGeometryChanged(true);
		setPreviewGeometry(null);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={previewGeometry as unknown as GeoJSON.GeoJSON | null}
						onMapReady={handleMapReady}
					/>
					{draw.isRequestingPoint ? (
						<MapPrompt>
							<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
							Click the map to place the source reduction point. Press Esc to cancel.
						</MapPrompt>
					) : null}
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
							<form.FormErrorAlert title="Unable to save source reduction" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to save source reduction</AlertTitle>
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
										The point is where the sources were eliminated. An address is optional reference
										— refine the point off it to the precise spot.
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

								<PointControl
									canMoveToAddress={addressCoord !== null}
									geometry={geometry}
									isDrawing={draw.isRequestingPoint}
									onClear={clearPoint}
									onMoveToAddress={moveToAddress}
									onRequestPoint={requestActionPoint}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Work performed">
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
