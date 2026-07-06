import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { HabitatRow, HabitatTypeRow, LarvalDensity, ProfileRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	ArrowLeftIcon,
	CheckIcon,
	Loader2Icon,
	MapPinnedIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { useAppForm } from '../../../forms';
import { webCollections } from '../../../sync/webCollections';
import { densityLabel, type LifeStageFlags } from '../-larval-display';
import { todayInTimeZone } from '../-overview-data';

export type InspectionLocationMode = 'habitat' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const unsetDensityValue = 'unset';
export const noHabitatTypeValue = 'none';

// Ordered low -> high so the density select reads as an escalating scale.
const DENSITY_OPTIONS: readonly LarvalDensity[] = [
	'none',
	'light',
	'medium',
	'heavy',
	'very_heavy',
];

const LIFE_STAGE_SEGMENTS: readonly {
	readonly key: keyof LifeStageFlags;
	readonly symbol: string;
	readonly label: string;
}[] = [
	{ key: 'hasEggs', symbol: 'E', label: 'Eggs' },
	{ key: 'hasFirstInstar', symbol: '1', label: '1st instar' },
	{ key: 'hasSecondInstar', symbol: '2', label: '2nd instar' },
	{ key: 'hasThirdInstar', symbol: '3', label: '3rd instar' },
	{ key: 'hasFourthInstar', symbol: '4', label: '4th instar' },
	{ key: 'hasPupae', symbol: 'P', label: 'Pupae' },
];

export interface InspectionFormValues {
	/** Whether the inspection is tied to an existing habitat or an ad-hoc location. */
	readonly locationMode: InspectionLocationMode;
	/** The target habitat when `locationMode === 'habitat'`. */
	readonly habitatId: string | null;
	/** Optional habitat type for an ad-hoc inspection (`noHabitatTypeValue` = none). */
	readonly habitatTypeId: string;
	/** Optional linked address for an ad-hoc inspection. */
	readonly addressId: string | null;
	/** `YYYY-MM-DD` calendar day the inspection was performed. */
	readonly inspectionDate: string;
	/** Attribution; left null defaults to the acting profile server-side. */
	readonly inspectedByProfileId: string | null;
	readonly isWet: boolean;
	/** `unsetDensityValue` or a `LarvalDensity`. */
	readonly density: string;
	readonly dipCount: number | null;
	readonly larvaeCount: number | null;
	readonly lifeStages: LifeStageFlags;
	/** Optional comment to attach to the inspection on save (blank = none). */
	readonly comment: string;
}

export interface InspectionFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo: '/larval-surveillance/inspections' | '/larval-surveillance/inspections/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface InspectionFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly entryMode: LarvalInspectionEntryMode;
	readonly profiles: readonly ProfileRow[];
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly defaultValues: InspectionFormValues;
	/** Ad-hoc geometry to pre-fill on edit; create starts with none. */
	readonly initialAdhocGeometry?: DrawGeometry | null;
	/** Geometry to frame the map on immediately (edit pre-fill). */
	readonly initialPreviewGeometry?: GeoJsonGeometry | null;
	/** Edit locks the habitat/ad-hoc choice — the two are distinct command paths. */
	readonly lockLocationMode?: boolean;
	readonly header: InspectionFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: {
		readonly values: InspectionFormValues;
		readonly adhocGeometry: DrawGeometry | null;
	}) => Promise<void>;
}

export function defaultInspectionFormValues(today: string): InspectionFormValues {
	return {
		locationMode: 'habitat',
		habitatId: null,
		habitatTypeId: noHabitatTypeValue,
		addressId: null,
		inspectionDate: today,
		inspectedByProfileId: null,
		isWet: true,
		density: unsetDensityValue,
		dipCount: null,
		larvaeCount: null,
		lifeStages: emptyLifeStages(),
		comment: '',
	};
}

interface ResultColumns {
	readonly density: boolean;
	readonly dips: boolean;
	readonly larvae: boolean;
}

// Which abundance inputs the agency's entry policy makes meaningful — mirrors the
// server-side validation so the form only asks for fields it can accept.
function resultColumnsForMode(mode: LarvalInspectionEntryMode): ResultColumns {
	switch (mode) {
		case 'density_only':
			return { density: true, dips: true, larvae: false };
		case 'count_and_dips_required':
			return { density: false, dips: true, larvae: true };
		default:
			return { density: true, dips: true, larvae: true };
	}
}

export function InspectionFormPage({
	organizationId,
	canSubmit,
	entryMode,
	profiles,
	habitatTypes,
	defaultValues,
	initialAdhocGeometry = null,
	initialPreviewGeometry = null,
	lockLocationMode = false,
	header,
	submitLabel,
	onSave,
}: InspectionFormPageProps) {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const columns = resultColumnsForMode(entryMode);

	const [map, setMap] = useState<MapboxMap | null>(null);
	const [adhocGeometry, setAdhocGeometry] = useState<DrawGeometry | null>(initialAdhocGeometry);
	const [previewGeometry, setPreviewGeometry] = useState<GeoJsonGeometry | null>(
		initialPreviewGeometry,
	);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: null,
		onChange: () => undefined,
	});
	const { requestPoint } = draw;

	// Ease the map to frame whatever location is currently chosen (a selected
	// habitat's geometry or a freshly dropped ad-hoc point) without a manual pan.
	useFitToGeometry(map, previewGeometry);

	const activeHabitatTypes = useMemo(
		() => habitatTypes.filter((type) => type.isActive),
		[habitatTypes],
	);
	const activeProfiles = useMemo(() => profiles.filter((profile) => profile.isActive), [profiles]);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.locationMode === 'habitat' && value.habitatId === null) {
				setLocationError('Select the habitat this inspection covers.');
				return;
			}
			if (value.locationMode === 'adhoc' && adhocGeometry === null) {
				setLocationError('Drop a point on the map for this ad-hoc inspection.');
				return;
			}
			try {
				await onSave({
					values: value,
					adhocGeometry: value.locationMode === 'adhoc' ? adhocGeometry : null,
				});
			} catch (error) {
				setSaveError(error instanceof Error ? error.message : 'Unable to save inspection.');
			}
		},
	});

	const handleHabitatSelected = useCallback((habitat: HabitatRow | null) => {
		setLocationError(null);
		if (habitat === null) {
			setPreviewGeometry(null);
			return;
		}
		// Habitat geometry is not part of the Electric shape (ADR 0009); fetch it so
		// the map can frame the selected habitat.
		void fetchHabitatGeometry(habitat.id).then((geometry) => setPreviewGeometry(geometry));
	}, []);

	const requestAdhocPoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the inspection point.');
			setAdhocGeometry(point);
			setPreviewGeometry(point as unknown as GeoJsonGeometry);
		} catch {
			// The draw was cancelled (Esc / mode switch); leave the prior point intact.
		}
	}, [requestPoint]);

	const clearAdhoc = useCallback(() => {
		setAdhocGeometry(null);
		setPreviewGeometry(null);
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={previewGeometry as unknown as GeoJSON.GeoJSON | null}
						habitatLayer={{ serverUrl: getServerUrl(), filters: { isActive: true } }}
						onMapReady={handleMapReady}
					/>
					{draw.isRequestingPoint ? (
						<MapPrompt>
							<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
							Click the map to place the inspection point. Press Esc to cancel.
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
							<form.FormErrorAlert title="Unable to save inspection" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to save inspection</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<section
								aria-labelledby="inspection-location-label"
								className={cn(
									'grid gap-4 rounded-md border bg-muted/30 p-4',
									locationError === null ? 'border-border/50' : 'border-destructive/60',
								)}
							>
								<div className="grid gap-0.5">
									<span
										className="font-semibold text-foreground text-sm leading-none"
										id="inspection-location-label"
									>
										Location
									</span>
									<span className="text-muted-foreground text-xs">
										Tie the inspection to a mapped habitat, or drop an ad-hoc point.
									</span>
								</div>

								<form.AppField name="locationMode">
									{(field) => (
										<ToggleGroup
											aria-label="Location mode"
											className="w-full"
											disabled={lockLocationMode}
											onValueChange={(next) => {
												if (next === 'habitat' || next === 'adhoc') {
													field.handleChange(next);
												}
											}}
											size="sm"
											type="single"
											value={field.state.value}
											variant="outline"
										>
											<ToggleGroupItem className="flex-1 text-xs" value="habitat">
												Existing habitat
											</ToggleGroupItem>
											<ToggleGroupItem className="flex-1 text-xs" value="adhoc">
												Ad-hoc point
											</ToggleGroupItem>
										</ToggleGroup>
									)}
								</form.AppField>

								<form.Subscribe selector={(state) => state.values.locationMode}>
									{(locationMode) =>
										locationMode === 'habitat' ? (
											<form.AppField name="habitatId">
												{(field) => (
													<HabitatPicker
														onSelect={(habitat) => {
															field.handleChange(habitat?.id ?? null);
															handleHabitatSelected(habitat);
														}}
														organizationId={organizationId}
														value={field.state.value}
													/>
												)}
											</form.AppField>
										) : (
											<div className="grid gap-4">
												<AdhocPointControl
													geometry={adhocGeometry}
													isDrawing={draw.isRequestingPoint}
													onClear={clearAdhoc}
													onRequestPoint={requestAdhocPoint}
												/>
												<form.AppField name="habitatTypeId">
													{(field) => (
														<field.SelectField
															label="Habitat type (optional)"
															options={habitatTypeOptions(activeHabitatTypes)}
															placeholder="Unassigned type"
														/>
													)}
												</form.AppField>
											</div>
										)
									}
								</form.Subscribe>

								{locationError === null ? null : (
									<p className="m-0 text-destructive text-sm">{locationError}</p>
								)}
							</section>

							<FormSection title="Inspection">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="inspectionDate">
										{(field) => (
											<LabeledControl label="Inspection date">
												<DatePicker
													ariaLabel="Inspection date"
													className="w-full"
													max={parseLocalDate(today)}
													onChange={(date) =>
														field.handleChange(date === undefined ? '' : formatLocalDate(date))
													}
													placeholder="Select date"
													value={parseLocalDate(field.state.value)}
												/>
											</LabeledControl>
										)}
									</form.AppField>
									<form.AppField name="inspectedByProfileId">
										{(field) => (
											<field.SelectField
												label="Inspector (optional)"
												options={profileOptions(activeProfiles)}
												placeholder="Default to me"
											/>
										)}
									</form.AppField>
								</div>
							</FormSection>

							<FormSection title="Findings">
								<form.AppField name="isWet">
									{(field) => (
										<LabeledControl
											description="Larvae can only be present when standing water was found."
											label="Water state"
										>
											<WaterToggle onChange={field.handleChange} value={field.state.value} />
										</LabeledControl>
									)}
								</form.AppField>

								<form.Subscribe selector={(state) => state.values.isWet}>
									{(isWet) =>
										isWet ? (
											<div className="grid gap-5">
												<div className="grid gap-5 sm:grid-cols-2">
													{columns.density ? (
														<form.AppField name="density">
															{(field) => (
																<field.SelectField
																	label={
																		entryMode === 'density_only' ? 'Density' : 'Density (optional)'
																	}
																	options={densityOptions()}
																	placeholder="Select density"
																/>
															)}
														</form.AppField>
													) : null}
													{columns.dips ? (
														<form.AppField name="dipCount">
															{(field) => (
																<field.NumberField
																	label={
																		entryMode === 'count_and_dips_required'
																			? 'Dips taken'
																			: 'Dips (optional)'
																	}
																	min={1}
																	placeholder="e.g. 10"
																/>
															)}
														</form.AppField>
													) : null}
													{columns.larvae ? (
														<form.AppField name="larvaeCount">
															{(field) => (
																<field.NumberField
																	label="Larvae counted"
																	min={0}
																	placeholder="e.g. 24"
																/>
															)}
														</form.AppField>
													) : null}
												</div>

												<form.AppField name="lifeStages">
													{(field) => (
														<LabeledControl
															description="Mark every immature stage present. Required when larvae were found."
															label="Life stages"
														>
															<LifeStageSelector
																onChange={field.handleChange}
																value={field.state.value}
															/>
														</LabeledControl>
													)}
												</form.AppField>
											</div>
										) : (
											<p className="m-0 rounded-md border border-border/40 bg-muted/30 px-3 py-3 text-muted-foreground text-sm">
												Dry inspections record no abundance or life-stage detail.
											</p>
										)
									}
								</form.Subscribe>
							</FormSection>

							<FormSection title="Notes">
								<form.AppField name="comment">
									{(field) => (
										<field.TextareaField
											description="Saved as the first comment on this inspection. Add access details, conditions, or follow-up."
											label="Comment (optional)"
											placeholder="Add a note for this inspection…"
											rows={3}
										/>
									)}
								</form.AppField>
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

// --- location controls ------------------------------------------------------

function AdhocPointControl({
	geometry,
	isDrawing,
	onRequestPoint,
	onClear,
}: {
	readonly geometry: DrawGeometry | null;
	readonly isDrawing: boolean;
	readonly onRequestPoint: () => void;
	readonly onClear: () => void;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2">
					<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
					<p className="m-0 min-w-0 text-foreground text-sm">
						{geometry === null ? 'No point placed yet.' : adhocPointSummary(geometry)}
					</p>
				</div>
				{geometry === null ? (
					<Badge tone="neutral" variant="outline">
						Not set
					</Badge>
				) : (
					<Badge tone="success" variant="outline">
						<CheckIcon aria-hidden="true" />
						Placed
					</Badge>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={isDrawing}
					onClick={onRequestPoint}
					size="sm"
					type="button"
					variant={geometry === null ? 'default' : 'outline'}
				>
					{isDrawing ? (
						<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
					) : (
						<MapPinnedIcon aria-hidden="true" data-icon="inline-start" />
					)}
					{geometry === null ? 'Drop point' : 'Replace point'}
				</Button>
				{geometry === null ? null : (
					<Button onClick={onClear} size="sm" type="button" variant="ghost">
						<XIcon aria-hidden="true" data-icon="inline-start" />
						Clear
					</Button>
				)}
			</div>
		</div>
	);
}

// --- habitat picker ---------------------------------------------------------

const habitatSearchGcTimeMs = 30_000;

function HabitatPicker({
	organizationId,
	value,
	onSelect,
}: {
	readonly organizationId: string;
	readonly value: string | null;
	readonly onSelect: (habitat: HabitatRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState('');
	const deferredSearch = useDeferredValue(search);
	const anchorRef = useRef<HTMLDivElement>(null);

	return (
		<LabeledControl label="Habitat">
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverAnchor asChild>
					<div className="relative" ref={anchorRef}>
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							className="pr-10 pl-9"
							onChange={(event) => {
								setSearch(event.target.value);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							placeholder="Search habitats"
							value={open ? search : selectedLabel}
						/>
						{value === null ? null : (
							<Button
								aria-label="Clear habitat"
								className="-translate-y-1/2 absolute top-1/2 right-1.5"
								onClick={() => {
									setSelectedLabel('');
									setSearch('');
									onSelect(null);
								}}
								size="icon-xs"
								type="button"
								variant="ghost"
							>
								<XIcon aria-hidden="true" />
							</Button>
						)}
					</div>
				</PopoverAnchor>
				<PopoverContent
					align="start"
					className="grid w-(--radix-popover-trigger-width) min-w-80 gap-2 p-2"
					onInteractOutside={(event) => {
						const target = event.detail.originalEvent.target as Node | null;
						if (target !== null && anchorRef.current?.contains(target)) {
							event.preventDefault();
						}
					}}
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<HabitatSearchResults
						onSelect={(habitat) => {
							setSelectedLabel(habitatLabel(habitat));
							setSearch(habitatLabel(habitat));
							onSelect(habitat);
							setOpen(false);
						}}
						organizationId={organizationId}
						search={deferredSearch}
						selectedValue={value}
					/>
				</PopoverContent>
			</Popover>
		</LabeledControl>
	);
}

function HabitatSearchResults({
	organizationId,
	search,
	selectedValue,
	onSelect,
}: {
	readonly organizationId: string;
	readonly search: string;
	readonly selectedValue: string | null;
	readonly onSelect: (habitat: HabitatRow) => void;
}) {
	const normalized = search.trim();
	const pattern = `%${normalized}%`;
	const { data, isReady, isError } = useLiveQuery(
		{
			gcTime: habitatSearchGcTimeMs,
			query: (query) => {
				const base = query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) => eq(habitat.organizationId, organizationId));
				const filtered =
					normalized.length === 0
						? base
						: base.where(({ habitat }) =>
								and(
									eq(habitat.organizationId, organizationId),
									or(ilike(habitat.habitatName, pattern), ilike(habitat.description, pattern)),
								),
							);
				return filtered.orderBy(({ habitat }) => habitat.habitatName, 'asc').limit(6);
			},
		},
		[organizationId, pattern],
	);

	if (isError) {
		return <SearchFallback label="Habitats unavailable" />;
	}
	if (!isReady && (data ?? []).length === 0) {
		return <SearchFallback label="Searching habitats" />;
	}
	const habitats = (data ?? []) as readonly HabitatRow[];
	if (habitats.length === 0) {
		return <SearchFallback label="No habitat matches" />;
	}

	return (
		<div className="grid gap-1">
			{habitats.map((habitat) => (
				<button
					className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
					key={habitat.id}
					onClick={() => onSelect(habitat)}
					type="button"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium">{habitatLabel(habitat)}</span>
						{habitat.description.trim().length === 0 ? null : (
							<span className="block truncate text-muted-foreground text-xs">
								{habitat.description}
							</span>
						)}
					</span>
					{habitat.id === selectedValue ? <CheckIcon aria-hidden="true" /> : null}
				</button>
			))}
		</div>
	);
}

function SearchFallback({ label }: { readonly label: string }) {
	return (
		<div className="flex min-h-16 items-center justify-center gap-2 rounded-md bg-muted/50 text-muted-foreground text-sm">
			<SearchIcon aria-hidden="true" />
			{label}
		</div>
	);
}

// --- reusable form controls -------------------------------------------------

function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
	);
}

function LabeledControl({
	label,
	description,
	children,
}: {
	readonly label: string;
	readonly description?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			{children}
			{description === undefined ? null : (
				<span className="text-muted-foreground text-xs">{description}</span>
			)}
		</div>
	);
}

function WaterToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (value: boolean) => void;
}) {
	return (
		<ToggleGroup
			aria-label="Water state"
			className="w-full sm:w-auto"
			onValueChange={(next) => {
				if (next === 'wet' || next === 'dry') {
					onChange(next === 'wet');
				}
			}}
			size="sm"
			type="single"
			value={value ? 'wet' : 'dry'}
			variant="outline"
		>
			<ToggleGroupItem className="px-6" value="wet">
				Wet
			</ToggleGroupItem>
			<ToggleGroupItem className="px-6" value="dry">
				Dry
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

function LifeStageSelector({
	value,
	onChange,
}: {
	readonly value: LifeStageFlags;
	readonly onChange: (value: LifeStageFlags) => void;
}) {
	return (
		<div className="inline-flex overflow-hidden rounded-md border border-border">
			{LIFE_STAGE_SEGMENTS.map((segment, index) => {
				const isOn = value[segment.key];
				return (
					<button
						aria-label={segment.label}
						aria-pressed={isOn}
						className={cn(
							'flex size-9 items-center justify-center font-semibold text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
							index > 0 && 'border-border border-l',
							isOn
								? 'bg-primary text-primary-foreground'
								: 'bg-background text-muted-foreground hover:bg-muted/60',
						)}
						key={segment.key}
						onClick={() => onChange({ ...value, [segment.key]: !isOn })}
						title={segment.label}
						type="button"
					>
						{segment.symbol}
					</button>
				);
			})}
		</div>
	);
}

function MapPrompt({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in">
			<p className="m-0 inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</p>
		</div>
	);
}

// --- helpers ----------------------------------------------------------------

function emptyLifeStages(): LifeStageFlags {
	return {
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
	};
}

function densityOptions() {
	return [
		{ label: 'Not recorded', value: unsetDensityValue },
		...DENSITY_OPTIONS.map((density) => ({ label: densityLabel(density), value: density })),
	];
}

function habitatTypeOptions(habitatTypes: readonly HabitatTypeRow[]) {
	return [
		{ label: 'Unassigned type', value: noHabitatTypeValue },
		...habitatTypes.map((type) => ({ label: type.name, value: type.id })),
	];
}

function profileOptions(profiles: readonly ProfileRow[]) {
	return profiles.map((profile) => ({ label: profile.displayName, value: profile.id }));
}

function habitatLabel(habitat: HabitatRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function adhocPointSummary(geometry: DrawGeometry): string {
	if (geometry.type !== 'Point') {
		return 'Point placed';
	}
	const coordinates = geometry.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) {
		return 'Point placed';
	}
	return `Point · ${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

/** Parse a `YYYY-MM-DD` string to a local Date, or undefined when empty/invalid. */
function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [year, month, day] = value.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Format a local Date back to a `YYYY-MM-DD` string (its own calendar day). */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function useFitToGeometry(map: MapboxMap | null, geometry: GeoJsonGeometry | null): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null) {
			return;
		}
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;

		const bounds = boundsFromGeoJson(geometry);
		if (bounds === null) {
			return;
		}
		const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
		if (hasArea) {
			map.fitBounds(
				[
					[bounds.west, bounds.south],
					[bounds.east, bounds.north],
				],
				{ padding: 80, maxZoom: 17, duration: 600 },
			);
		} else {
			map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
		}
	}, [map, geometry]);
}

async function fetchHabitatGeometry(habitatId: string): Promise<GeoJsonGeometry | null> {
	try {
		const response = await fetch(new URL(`/map/habitats/${habitatId}`, getServerUrl()), {
			credentials: 'include',
		});
		if (!response.ok) {
			return null;
		}
		const body = (await response.json()) as {
			readonly habitat?: { readonly geojson?: unknown };
		};
		return (body.habitat?.geojson ?? null) as GeoJsonGeometry | null;
	} catch {
		return null;
	}
}

export type { DrawGeometry } from '../../../components/map/use-map-draw';
