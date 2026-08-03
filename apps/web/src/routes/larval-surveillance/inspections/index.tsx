import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { HabitatTypeRow, LarvalDensity } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { CheckIcon, MapPinnedIcon, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import {
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	toggle,
	usePersonnelOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	DensityBadge,
	densityLabel,
	hasAnyLifeStage,
	LifeStageStrip,
	WetnessBadge,
} from '../../../components/larval-display';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	type InspectionTileFilters,
	MapCanvas,
} from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { adhocLabel } from '../../../lib/coordinate-label';
import { webCollections } from '../../../sync/webCollections';
import { InspectionMapCard } from '../-inspection-map-card';
import { inspectionsSearchSchema } from '../-inspections-search';
import {
	addDaysToDateString,
	formatListDate,
	formatMonthDay,
	todayInTimeZone,
} from '../-overview-data';

export const Route = createFileRoute('/larval-surveillance/inspections/')({
	component: InspectionsExplorerRoute,
	validateSearch: (search) => inspectionsSearchSchema.parse(search),
});

/**
 * One inspection as returned by `/map/inspections` — the owned-geometry projection
 * plus the record fields and the joined habitat / address / inspector labels the
 * list and detail card need to identify a row (an inspection has no name of its own).
 */
interface InspectionSite {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

type WetFilter = 'all' | 'wet' | 'dry';

/** The window the explorer opens with, and the reset target for "Clear all". */
const DEFAULT_WINDOW_DAYS = 30;

const PAGE_SIZE = 50;

const WETNESS_OPTIONS: readonly { readonly value: WetFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'wet', label: 'Wet' },
	{ value: 'dry', label: 'Dry' },
];

// Ordered low → high so the filter chips read as the map's heat ramp legend.
const DENSITY_ORDER: readonly LarvalDensity[] = ['none', 'light', 'medium', 'heavy', 'very_heavy'];

function InspectionsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);

	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);

	// Seed the filter state from the URL search params (a deep link from the
	// overview's "view on map" actions), falling back to the explorer's defaults.
	// State is local from here on; the params only prime the initial view.
	const search = Route.useSearch();
	const [dateFrom, setDateFrom] = useState(() => search.from ?? defaultFrom);
	const [dateTo, setDateTo] = useState(() => search.to ?? today);
	const [wetness, setWetness] = useState<WetFilter>(() => search.water ?? 'all');
	const [densities, setDensities] = useState<ReadonlySet<LarvalDensity>>(
		() => new Set(search.density),
	);
	const [positiveOnly, setPositiveOnly] = useState(() => search.positive ?? false);
	const [inspectorIds, setInspectorIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [typeIds, setTypeIds] = useState<ReadonlySet<string>>(() => new Set(search.types));
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [page, setPage] = useState(0);

	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);
	const typeNameById = useMemo(
		() => new Map(habitatTypes.map((type) => [type.id, type.name])),
		[habitatTypes],
	);

	const filters = useMemo<InspectionTileFilters>(
		() => ({
			...(wetness === 'all' ? {} : { isWet: wetness === 'wet' }),
			...(densities.size > 0 ? { densities: [...densities] } : {}),
			...(positiveOnly ? { positiveOnly: true } : {}),
			...(typeIds.size > 0 ? { habitatTypeIds: [...typeIds] } : {}),
			...(inspectorIds.size > 0 ? { inspectedByProfileIds: [...inspectorIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[wetness, densities, positiveOnly, typeIds, inspectorIds, dateFrom, dateTo],
	);

	// Editing one bound past the other drags the other along, so the range never
	// inverts into an empty query.
	const handleFromChange = useCallback((next: string) => {
		setDateFrom(next);
		setDateTo((prev) => (next !== '' && prev !== '' && next > prev ? next : prev));
	}, []);
	const handleToChange = useCallback((next: string) => {
		setDateTo(next);
		setDateFrom((prev) => (next !== '' && prev !== '' && next < prev ? next : prev));
	}, []);
	const applyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setDateFrom(range.from);
			setDateTo(range.to);
		},
		[today],
	);

	// Which preset (if any) the current range exactly matches — drives chip highlight.
	const activePresetId = useMemo(
		() => activeDatePresetId(dateFrom, dateTo, today),
		[dateFrom, dateTo, today],
	);

	const personnel = usePersonnelOptions();
	const bounds = useMapBounds(map);
	const { rows, total, isLoading } = useVisibleInspections(bounds, filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// A new viewport or filter set always starts back at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the viewport + filters.
	useEffect(() => {
		setPage(0);
	}, [bounds, filters]);

	// Clamp if the row count shrinks under the current page.
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedInspection(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected inspection whenever the resolved selection changes.
	useEffect(() => {
		if (map === null || selected?.lat == null || selected.lng == null) {
			return;
		}
		map.flyTo({
			center: [selected.lng, selected.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 700,
		});
	}, [map, selected?.lat, selected?.lng]);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const inspectionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const isDefaultRange = dateFrom === defaultFrom && dateTo === today;
	const hasActiveFilters =
		!isDefaultRange ||
		wetness !== 'all' ||
		densities.size > 0 ||
		positiveOnly ||
		typeIds.size > 0 ||
		inspectorIds.size > 0;

	const resetDates = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
	}, [defaultFrom, today]);

	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setWetness('all');
		setDensities(new Set());
		setPositiveOnly(false);
		setTypeIds(new Set());
		setInspectorIds(new Set());
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						fitToData
						inspectionLayer={inspectionLayer}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<InspectionMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Inspections</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<Button asChild size="sm">
								<Link to="/larval-surveillance/inspections/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Record
								</Link>
							</Button>
						</div>
					</div>

					<DateRangeFilter
						activePresetId={activePresetId}
						from={dateFrom}
						onApplyPreset={applyPreset}
						onFromChange={handleFromChange}
						onToChange={handleToChange}
						to={dateTo}
						today={today}
					/>

					<SegmentedFilter
						label="Water"
						onChange={setWetness}
						options={WETNESS_OPTIONS}
						value={wetness}
					/>

					<DensityFilter onChange={setDensities} selected={densities} />

					<div className="flex flex-wrap items-center gap-2">
						<PositiveToggle onChange={setPositiveOnly} value={positiveOnly} />
						<MultiSelectFilter
							empty="No habitat types"
							label="Habitat type"
							onChange={setTypeIds}
							options={habitatTypes.map((type) => ({ id: type.id, label: type.name }))}
							selected={typeIds}
						/>
						<MultiSelectFilter
							empty="No people"
							label="Inspector"
							onChange={setInspectorIds}
							options={personnel.options}
							selected={inspectorIds}
						/>
					</div>

					{hasActiveFilters ? (
						<ActiveFilters
							densities={densities}
							from={dateFrom}
							inspectorIds={inspectorIds}
							isDefaultRange={isDefaultRange}
							onClearAll={clearAll}
							onClearPositive={() => setPositiveOnly(false)}
							onClearWetness={() => setWetness('all')}
							onResetDates={resetDates}
							onToggleDensity={(value) => setDensities(toggle(densities, value))}
							onToggleInspector={(id) => setInspectorIds(toggle(inspectorIds, id))}
							onToggleType={(id) => setTypeIds(toggle(typeIds, id))}
							personnelNameById={personnel.nameById}
							positiveOnly={positiveOnly}
							to={dateTo}
							typeIds={typeIds}
							typeNameById={typeNameById}
							wetness={wetness}
						/>
					) : null}
				</div>

				<InspectionResults
					isLoading={isLoading}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
					typeNameById={typeNameById}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="inspections"
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			</div>
		</MapSplitPage>
	);
}

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None in view' : `${total} in view`}
		</span>
	);
}

function SegmentedFilter<T extends string>({
	label,
	icon,
	value,
	onChange,
	options,
}: {
	readonly label: string;
	readonly icon?: ReactNode;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="flex w-14 shrink-0 items-center gap-1 font-medium text-muted-foreground text-xs">
				{icon}
				{label}
			</span>
			<ToggleGroup
				aria-label={label}
				className="flex-1"
				onValueChange={(next) => {
					if (next) {
						onChange(next as T);
					}
				}}
				size="sm"
				type="single"
				value={value}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/**
 * Larval-density multi-select rendered as a chip row, each chip carrying the heat
 * color it maps to on the map — so the filter doubles as the map's legend.
 */
function DensityFilter({
	selected,
	onChange,
}: {
	readonly selected: ReadonlySet<LarvalDensity>;
	readonly onChange: (next: ReadonlySet<LarvalDensity>) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="w-14 shrink-0 pt-1 font-medium text-muted-foreground text-xs">Density</span>
			<fieldset className="m-0 flex min-w-0 flex-1 flex-wrap gap-1.5 border-0 p-0">
				<legend className="sr-only">Filter by larval density</legend>
				{DENSITY_ORDER.map((value) => {
					const isSelected = selected.has(value);
					return (
						<button
							aria-pressed={isSelected}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isSelected
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
							)}
							key={value}
							onClick={() => onChange(toggle(selected, value))}
							type="button"
						>
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
								style={{ backgroundColor: INSPECTION_DENSITY_COLORS[value] }}
							/>
							{densityLabel(value)}
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}

function PositiveToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (next: boolean) => void;
}) {
	return (
		<button
			aria-pressed={value}
			className={cn(
				'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				value
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			onClick={() => onChange(!value)}
			type="button"
		>
			<span
				className={cn(
					'flex size-3.5 items-center justify-center rounded-[4px] border',
					value ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
				)}
			>
				{value ? <CheckIcon aria-hidden="true" className="size-2.5" /> : null}
			</span>
			Larvae found only
		</button>
	);
}

function ActiveFilters({
	from,
	to,
	isDefaultRange,
	wetness,
	densities,
	positiveOnly,
	typeIds,
	typeNameById,
	inspectorIds,
	personnelNameById,
	onResetDates,
	onClearWetness,
	onToggleDensity,
	onClearPositive,
	onToggleType,
	onToggleInspector,
	onClearAll,
}: {
	readonly from: string;
	readonly to: string;
	readonly isDefaultRange: boolean;
	readonly wetness: WetFilter;
	readonly densities: ReadonlySet<LarvalDensity>;
	readonly positiveOnly: boolean;
	readonly typeIds: ReadonlySet<string>;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly inspectorIds: ReadonlySet<string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
	readonly onResetDates: () => void;
	readonly onClearWetness: () => void;
	readonly onToggleDensity: (value: LarvalDensity) => void;
	readonly onClearPositive: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onToggleInspector: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{isDefaultRange ? null : (
				<FilterChip label={`Dates: ${dateRangeLabel(from, to)}`} onRemove={onResetDates} />
			)}
			{wetness !== 'all' ? (
				<FilterChip
					label={`Water: ${wetness === 'wet' ? 'Wet' : 'Dry'}`}
					onRemove={onClearWetness}
				/>
			) : null}
			{DENSITY_ORDER.filter((value) => densities.has(value)).map((value) => (
				<FilterChip
					color={INSPECTION_DENSITY_COLORS[value]}
					key={`density-${value}`}
					label={densityLabel(value)}
					onRemove={() => onToggleDensity(value)}
				/>
			))}
			{positiveOnly ? <FilterChip label="Larvae found" onRemove={onClearPositive} /> : null}
			{[...typeIds].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={typeNameById.get(id) ?? 'Unknown type'}
					onRemove={() => onToggleType(id)}
				/>
			))}
			{[...inspectorIds].map((id) => (
				<FilterChip
					key={`inspector-${id}`}
					label={personnelNameById.get(id) ?? 'Unknown inspector'}
					onRemove={() => onToggleInspector(id)}
				/>
			))}
			<button
				className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onClearAll}
				type="button"
			>
				Clear all
			</button>
		</div>
	);
}

function InspectionResults({
	rows,
	isLoading,
	selectedId,
	typeNameById,
	onSelect,
}: {
	readonly rows: readonly InspectionSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[64px]" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No inspections in view</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Pan or zoom the map, widen the time window, or loosen the filters to bring inspections
					into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((inspection) => (
				<InspectionListItem
					inspection={inspection}
					isSelected={inspection.id === selectedId}
					key={inspection.id}
					onSelect={onSelect}
					typeName={resolveTypeName(inspection, typeNameById)}
				/>
			))}
		</ul>
	);
}

function InspectionListItem({
	inspection,
	typeName,
	isSelected,
	onSelect,
}: {
	readonly inspection: InspectionSite;
	readonly typeName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const label = siteLabel(inspection);
	const when = formatListDate(inspection.inspectionDate);
	return (
		<ExplorerRow
			badges={
				<>
					{inspection.isWet ? (
						<DensityBadge density={inspection.density} />
					) : (
						<WetnessBadge isWet={false} />
					)}
					{inspection.isWet && hasAnyLifeStage(inspection) ? (
						<LifeStageStrip size="sm" stages={inspection} />
					) : null}
				</>
			}
			date={when}
			detailLabel={`View details for the ${when} inspection of ${label}`}
			detailLink={{ to: '/larval-surveillance/inspections/$id', params: { id: inspection.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(inspection.id)}
			personnel={inspection.inspectedByName}
			selectLabel={`Show the ${when} inspection of ${label} on the map`}
			subtitle={typeName}
			swatch={inspectionSwatch(inspection)}
			title={label}
			{...(inspection.habitatId === null
				? {}
				: {
						titleLink: {
							to: '/larval-surveillance/habitats/$id' as const,
							params: { id: inspection.habitatId },
						},
					})}
		/>
	);
}

/** The heat colour this inspection draws in, so the row matches the map. */
function inspectionSwatch(inspection: InspectionSite): {
	readonly color: string;
	readonly label: string;
} {
	if (!inspection.isWet) {
		return { color: INSPECTION_DRY_COLOR, label: 'Dry' };
	}
	// The map keys colours by density name; `none` is the documented fallback.
	const color =
		INSPECTION_DENSITY_COLORS[inspection.density ?? 'none'] ??
		INSPECTION_DENSITY_COLORS.none ??
		INSPECTION_DRY_COLOR;
	return { color, label: densityLabel(inspection.density) };
}

// --- data hooks -------------------------------------------------------------

function useVisibleInspections(
	bounds: BoundingBox | null,
	filters: InspectionTileFilters,
	page: number,
): {
	readonly rows: readonly InspectionSite[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const bbox = bounds === null ? null : formatBoundingBox(bounds);
	const query = useQuery({
		enabled: bbox !== null,
		queryKey: ['inspections', 'visible', bbox, filters, page],
		queryFn: ({ signal }) => fetchVisibleInspections(bounds, filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedInspection(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, InspectionSite>,
): InspectionSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['inspections', 'detail', selectedId],
		queryFn: ({ signal }) => fetchInspectionById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchVisibleInspections(
	bounds: BoundingBox | null,
	filters: InspectionTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: InspectionSite[]; readonly total: number }> {
	if (bounds === null) {
		return { rows: [], total: 0 };
	}
	const url = new URL('/map/inspections', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(normalizeBounds(bounds)));
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.isWet !== undefined) {
		url.searchParams.set('isWet', String(filters.isWet));
	}
	if (filters.densities !== undefined && filters.densities.length > 0) {
		url.searchParams.set('density', [...filters.densities].join(','));
	}
	if (filters.positiveOnly === true) {
		url.searchParams.set('positive', 'true');
	}
	if (filters.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		url.searchParams.set('habitatTypeId', filters.habitatTypeIds.join(','));
	}
	if (filters.inspectedByProfileIds !== undefined && filters.inspectedByProfileIds.length > 0) {
		url.searchParams.set('inspectedBy', filters.inspectedByProfileIds.join(','));
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Inspections request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly inspections?: InspectionSite[];
		readonly total?: number;
	};
	return { rows: body.inspections ?? [], total: body.total ?? 0 };
}

async function fetchInspectionById(
	id: string,
	signal: AbortSignal,
): Promise<InspectionSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/inspections/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly inspection?: InspectionSite };
	return body.inspection ?? null;
}

function useMapBounds(map: MapboxMap | null): BoundingBox | null {
	const [bounds, setBounds] = useState<BoundingBox | null>(null);

	useEffect(() => {
		if (map === null) {
			setBounds(null);
			return;
		}
		const update = () => {
			const next = map.getBounds();
			if (next === null) {
				return;
			}
			const candidate: BoundingBox = {
				east: next.getEast(),
				north: next.getNorth(),
				south: next.getSouth(),
				west: next.getWest(),
			};
			setBounds((current) =>
				current !== null &&
				formatBoundingBox(normalizeBounds(current)) ===
					formatBoundingBox(normalizeBounds(candidate))
					? current
					: candidate,
			);
		};

		update();
		map.on('moveend', update);
		map.on('zoomend', update);
		map.on('resize', update);
		return () => {
			map.off('moveend', update);
			map.off('zoomend', update);
			map.off('resize', update);
		};
	}, [map]);

	return bounds;
}

// --- helpers ----------------------------------------------------------------

/** Human label for the active range chip, tolerating open-ended bounds. */
function dateRangeLabel(from: string, to: string): string {
	if (from === '' && to === '') {
		return 'All dates';
	}
	if (from === '') {
		return `Until ${formatMonthDay(to)}`;
	}
	if (to === '') {
		return `From ${formatMonthDay(from)}`;
	}
	return `${formatMonthDay(from)} – ${formatMonthDay(to)}`;
}

function resolveTypeName(
	inspection: InspectionSite,
	typeNameById: ReadonlyMap<string, string>,
): string {
	if (inspection.habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(inspection.habitatTypeId) ?? 'Unknown type';
}

function siteLabel(inspection: InspectionSite): string {
	return (
		inspection.habitatName?.trim() ||
		inspection.addressDisplayName?.trim() ||
		(inspection.habitatId === null
			? adhocLabel(inspection.lat, inspection.lng)
			: `Habitat ${inspection.habitatId.slice(0, 8)}`)
	);
}

/** Clamp to valid lng/lat and collapse a world-spanning view to a single box. */
function normalizeBounds(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const span = bounds.east - bounds.west;
	if (!Number.isFinite(span) || span >= 360) {
		return { east: 180, north, south, west: -180 };
	}
	const west = clamp(bounds.west, -180, 180);
	const east = clamp(bounds.east, -180, 180);
	if (west > east) {
		return { east: 180, north, south, west: -180 };
	}
	return { east, north, south, west };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
