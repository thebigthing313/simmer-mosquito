import { isBiocontrolUnitType } from '@simmer-mosquito/domain';
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

export interface BiocontrolFormValues {
	/**
	 * Optional address the release happened at — reference data only. The action's
	 * own point (its geometry) is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat the agents were released into. */
	readonly habitatId: string | null;
	/** A biocontrol method id, or '' when unset (placeholder shown). */
	readonly biocontrolMethodId: string;
	/** `noTechnicianValue` or a profile id. */
	readonly technicianProfileId: string;
	/** `YYYY-MM-DD` — the date the agents were released. */
	readonly biocontrolDate: string;
	readonly amountReleased: number | null;
	/** A unit id, or '' when unset (placeholder shown). */
	readonly releaseUnitId: string;
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
	readonly biocontrolMethods: readonly ControlMethodRow[];
	readonly units: readonly UnitRow[];
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: BiocontrolFormValues;
	/** The action's point to pre-fill on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/**
	 * Whether a point must be set to submit. Create requires one; edit leaves it
	 * optional so an action keeps its existing point unless the user refines it.
	 */
	readonly requireLocation?: boolean;
	readonly header: BiocontrolFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: BiocontrolFormValues;
		/** The action's point. Always set on create; may be unchanged on edit. */
		readonly geometry: DrawGeometry | null;
		/** True when the user placed, moved, or cleared the point this session. */
		readonly geometryChanged: boolean;
	}) => Promise<void>;
}

export function defaultBiocontrolFormValues(): BiocontrolFormValues {
	return {
		addressId: null,
		habitatId: null,
		biocontrolMethodId: '',
		technicianProfileId: noTechnicianValue,
		biocontrolDate: todayDateValue(),
		amountReleased: null,
		releaseUnitId: '',
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
	initialPreviewGeometry = null,
	requireLocation = true,
	header,
	submitLabel,
	onSave,
}: BiocontrolFormPageProps) {
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

	const activeMethods = useMemo(
		() => biocontrolMethods.filter((method) => method.isActive),
		[biocontrolMethods],
	);
	// Biocontrol releases are counted, measured by volume, or weighed — the domain
	// rejects any other unit type.
	const releaseUnitOptions = useMemo(() => unitOptions(units, isBiocontrolUnitType), [units]);
	const technicianOptions = useMemo(
		() => [
			{ label: 'Unassigned', value: noTechnicianValue },
			...profiles
				.filter((profile) => profile.isActive)
				.map((profile) => ({ label: profile.displayName, value: profile.id })),
		],
		[profiles],
	);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.biocontrolMethodId === '') {
				setSaveError('Select the biocontrol method that was used.');
				return;
			}
			if (value.amountReleased === null || !(value.amountReleased > 0)) {
				setSaveError('Enter how much was released.');
				return;
			}
			if (value.releaseUnitId === '') {
				setSaveError('Select the unit the release was measured in.');
				return;
			}
			if (value.biocontrolDate === '') {
				setSaveError('Enter the date the agents were released.');
				return;
			}
			if (requireLocation && geometry === null) {
				setLocationError('Place the release point on the map.');
				return;
			}
			try {
				await onSave({ values: value, geometry, geometryChanged });
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save biocontrol action.');
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

	// Picking a habitat frames the map on the larval site the release targets, and
	// seeds the point there when nothing has been placed yet.
	const handleHabitatSelected = useCallback(
		(habitat: HabitatRow | null) => {
			if (habitat === null) {
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

	const requestReleasePoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the release point.');
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
							Click the map to place the release point. Press Esc to cancel.
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
							<form.FormErrorAlert title="Unable to Save Biocontrol Action" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Biocontrol Action</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<section
								aria-labelledby="biocontrol-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									locationError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="biocontrol-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										The point is where the agents were released. An address is optional reference —
										refine the point off it to the precise spot.
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
									onRequestPoint={requestReleasePoint}
								/>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Release">
								<form.AppField name="biocontrolMethodId">
									{(field) => (
										<field.SelectField
											label="Biocontrol method"
											options={activeMethods.map((method) => ({
												label: method.name,
												value: method.id,
											}))}
											placeholder="Select method"
										/>
									)}
								</form.AppField>
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="amountReleased">
										{(field) => (
											<field.NumberField label="Amount released" min={0} placeholder="e.g. 250" />
										)}
									</form.AppField>
									<form.AppField name="releaseUnitId">
										{(field) => (
											<field.SelectField
												label="Unit"
												options={releaseUnitOptions}
												placeholder="Select unit"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							<FormSection title="Work">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="biocontrolDate">
										{(field) => (
											<DateControl
												label="Release date"
												onChange={(next) => field.handleChange(next)}
												value={field.state.value}
											/>
										)}
									</form.AppField>
									<form.AppField name="technicianProfileId">
										{(field) => (
											<field.SelectField
												label="Technician (optional)"
												options={technicianOptions}
												placeholder="Unassigned"
											/>
										)}
									</form.AppField>
								</div>
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
									<span className="text-muted-foreground text-xs">
										Link the release to the larval site it was performed against.
									</span>
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

/** Parse a `YYYY-MM-DD` string to a local Date, or undefined when empty/invalid. */
function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
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
