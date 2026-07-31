import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import {
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { HabitatRow, HabitatTypeRow, LarvalDensity, ProfileRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
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
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { and, eq, ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { additionalPersonnelOptions } from '../../../components/additional-personnel';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { densityLabel, type LifeStageFlags } from '../../../components/larval-display';
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
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../forms/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { webCollections } from '../../../sync/webCollections';
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
	/** Profile ids of everyone else who worked this inspection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly isWet: boolean;
	/** `unsetDensityValue` or a `LarvalDensity`. */
	readonly density: string;
	readonly dipCount: number | null;
	readonly larvaeCount: number | null;
	readonly lifeStages: LifeStageFlags;
	/** Optional comment to attach to the inspection on save (blank = none). */
	readonly comment: string;
}

/** Domain issue path → the form field holding it. */
const INSPECTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	habitatId: 'habitatId',
	habitatTypeId: 'habitatTypeId',
	addressId: 'addressId',
	inspectionDate: 'inspectionDate',
	inspectedByProfileId: 'inspectedByProfileId',
	dipCount: 'dipCount',
	density: 'density',
	larvaeCount: 'larvaeCount',
};

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
		additionalPersonnelIds: [],
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
	const [adhocGeometryType, setAdhocGeometryType] = useState<DrawGeometryType>(
		initialAdhocGeometry?.type ?? 'Point',
	);
	// The selected habitat's shape, shown for reference in habitat mode. Ad-hoc
	// geometry is rendered by the draw layer instead.
	const [previewGeometry, setPreviewGeometry] = useState<GeoJsonGeometry | null>(
		initialPreviewGeometry,
	);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const handleAdhocGeometryChange = useCallback((next: DrawGeometry | null) => {
		setAdhocGeometry(next);
		if (next !== null) {
			setLocationError(null);
		}
	}, []);
	const draw = useMapDraw({
		map,
		isLoaded: map !== null,
		value: adhocGeometry,
		onChange: handleAdhocGeometryChange,
	});
	const { start } = draw;

	// Ease the map to frame whatever location is currently chosen (a selected
	// habitat's geometry or freshly drawn ad-hoc geometry) without a manual pan.
	useFitToGeometry(map, previewGeometry, draw.isDrawing);
	useFitToGeometry(map, adhocGeometry as unknown as GeoJsonGeometry | null, draw.isDrawing);

	const form = useAppForm({
		defaultValues,
		validators: {
			// Habitat and ad-hoc inspections are distinct commands with distinct
			// rules, so the validator picks the same one the save will.
			onSubmit: domainValidator(({ value }: { readonly value: InspectionFormValues }) => {
				const result = {
					...FORM_VALIDATION_CONTEXT,
					inspectionId: FORM_VALIDATION_CONTEXT.organizationId,
					inspectionDate: value.inspectionDate,
					inspectedByProfileId: value.inspectedByProfileId,
					isWet: value.isWet,
					dipCount: value.dipCount,
					density: value.density === unsetDensityValue ? null : (value.density as LarvalDensity),
					larvaeCount: value.larvaeCount,
					...value.lifeStages,
				};
				return value.locationMode === 'habitat'
					? recordHabitatInspectionCommand({
							...result,
							habitatId: value.habitatId ?? '',
						})
					: recordAdHocInspectionCommand({
							...result,
							locationSource: {
								kind: 'geometry',
								geometry: (adhocGeometry ?? null) as never,
							},
							addressId: value.addressId,
							habitatTypeId:
								value.habitatTypeId === noHabitatTypeValue ? null : value.habitatTypeId,
						});
			}, INSPECTION_FIELD_PATHS),
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			if (value.locationMode === 'habitat' && value.habitatId === null) {
				setLocationError('Select the habitat this inspection covers.');
				return;
			}
			if (value.locationMode === 'adhoc' && adhocGeometry === null) {
				setLocationError('Map the area this ad-hoc inspection covers.');
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

	// Switching tools replaces the shape, so the old one is cleared rather than
	// silently saved under the wrong type.
	const handleAdhocTypeChange = useCallback(
		(next: DrawGeometryType) => {
			setAdhocGeometryType(next);
			setAdhocGeometry(null);
			if (draw.isDrawing) {
				start(next);
			}
		},
		[draw.isDrawing, start],
	);

	const startAdhocDraw = useCallback(() => {
		setLocationError(null);
		// Ad-hoc geometry is the inspection's own; drop any habitat reference shape
		// still framing the map from a previous mode.
		setPreviewGeometry(null);
		start(adhocGeometryType);
	}, [adhocGeometryType, start]);

	const clearAdhoc = useCallback(() => {
		setAdhocGeometry(null);
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
					<DrawToolbar controller={draw} geometryType={adhocGeometryType} />
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
							<form.FormErrorAlert title="Unable to Save Inspection" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to Save Inspection</AlertTitle>
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
										Tie the inspection to a mapped habitat, or draw the ad-hoc location it covers.
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
												Ad-hoc location
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
												<GeometryControl
													controller={draw}
													geometry={adhocGeometry}
													geometryType={adhocGeometryType}
													label="Inspected location"
													onClear={clearAdhoc}
													onDraw={startAdhocDraw}
													onTypeChange={handleAdhocTypeChange}
													organizationId={organizationId}
												/>
												<form.AppField name="habitatTypeId">
													{(field) => (
														<field.SelectField
															label="Habitat type"
															options={habitatTypeOptions(habitatTypes)}
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
												label="Inspector"
												options={profileOptions(profiles)}
												placeholder="Default to me"
											/>
										)}
									</form.AppField>
								</div>
								<form.Subscribe selector={(state) => state.values.inspectedByProfileId}>
									{(inspectedByProfileId) => (
										<form.AppField name="additionalPersonnelIds">
											{(field) => (
												<field.MultiSelectField
													emptyMessage="No profiles"
													label="Additional personnel"
													options={additionalPersonnelOptions(profiles, field.state.value, {
														excludeProfileId: inspectedByProfileId,
													})}
													placeholder="Search profiles"
												/>
											)}
										</form.AppField>
									)}
								</form.Subscribe>
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
																	label={entryMode === 'density_only' ? 'Density' : 'Density'}
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
																		entryMode === 'count_and_dips_required' ? 'Dips taken' : 'Dips'
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
											label="Comment"
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
		...lifecycleOptions(
			habitatTypes,
			(type) => type.isActive,
			(type) => type.name,
		),
	];
}

function profileOptions(profiles: readonly ProfileRow[]) {
	return lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}

function habitatLabel(habitat: HabitatRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
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
