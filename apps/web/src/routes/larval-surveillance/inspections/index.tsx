import type { LarvalDensity } from '@simmer-mosquito/sync';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	mapQueryParams,
	SegmentedFilter,
	ToggleFilter,
	toggle,
	useDateRangeFilters,
	useExplorerPanel,
	useFlyToSelection,
	useHabitatTypeOptions,
	useMapBoundsParam,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
	whenAny,
	whenOn,
	whenText,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { densityLabel, hasAnyLifeStage, LifeStageStrip } from '../../../components/larval-display';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	type InspectionTileFilters,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapLegendEntry,
} from '../../../components/map';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { adhocLabel } from '../../../lib/coordinate-label';
import {
	DATE_RANGE_COUNTING,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { InspectionMapCard } from '../-inspection-map-card';
import {
	type InspectionFilters as InspectionSearchFilters,
	inspectionFilterCodecs,
} from '../-inspections-search';
import {
	addDaysToDateString,
	formatListDate,
	formatMonthDay,
	todayInTimeZone,
} from '../-overview-data';
import { inspectionLegend, type WetFilter } from './-legend';

const InspectionEntityIcon = iconRegistry.entities.inspection.icon;

export const Route = createFileRoute('/larval-surveillance/inspections/')({
	component: InspectionsExplorerRoute,
	validateSearch: searchValidator(inspectionFilterCodecs),
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

/** The window the explorer opens with, and the reset target for "Clear all". */
const DEFAULT_WINDOW_DAYS = 30;

const PATH = '/map/inspections';

const WETNESS_OPTIONS: readonly { readonly value: WetFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'wet', label: 'Wet' },
	{ value: 'dry', label: 'Dry' },
];

// Ordered low → high so the filter chips read as the map's heat ramp legend.
const DENSITY_ORDER: readonly LarvalDensity[] = ['none', 'light', 'medium', 'heavy', 'very_heavy'];

/**
 * The window the surface opens on, in the agency's zone.
 *
 * A fixed number of days back from today rather than a calendar month, so the
 * page opens on the same amount of work whenever it is opened.
 */
function useDefaultWindow(): { readonly defaultFrom: string; readonly today: string } {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	return { defaultFrom, today };
}

/** The three catalogs the filter controls read from. */
function useInspectionFilterOptions(): InspectionFilterOptions {
	const habitatTypes = useHabitatTypeOptions();
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	return {
		habitatTypes: habitatTypes.options,
		personnel,
		regions,
		typeNameById: habitatTypes.nameById,
	};
}

/**
 * The page of inspections in view, and whichever one is selected.
 *
 * The selected record is fetched on its own when it is not on the page in hand,
 * so a deep link to a record outside the current window still opens with the map
 * flown to it.
 */
function useInspectionResults({
	filters,
	map,
	selectedId,
}: {
	readonly filters: InspectionTileFilters;
	readonly map: MapboxMap | null;
	readonly selectedId: string | null;
}) {
	const bbox = useMapBoundsParam(map);
	const params = useMemo(() => inspectionQueryParams(bbox, filters), [bbox, filters]);
	const paged = usePagedMapResource<InspectionSite>({
		path: PATH,
		rowsKey: 'inspections',
		label: 'Inspections',
		params,
		enabled: bbox !== null,
	});
	const selected = useSelectedMapRecord<InspectionSite>({
		path: PATH,
		rowKey: 'inspection',
		rows: paged.rows,
		selectedId,
	});
	useFlyToSelection(map, selected);
	return { paged, selected };
}

const RESULT_NOUN = { one: 'inspection', many: 'inspections' };

/** What an empty or loading rail draws, which is the same whatever is filtered. */
const INSPECTION_RESULTS_COPY = {
	skeletonClassName: 'h-[64px]',
	emptyTitle: 'No inspections in view',
	emptyDescription:
		'Pan or zoom the map, widen the time window, or loosen the filters to bring inspections into range.',
} as const;

/** The panel's title row: what the surface is, and how much of it matched. */
function inspectionsHeading(total: number, isLoading: boolean) {
	return {
		title: 'Inspections',
		icon: InspectionEntityIcon,
		total,
		isLoading,
		noun: RESULT_NOUN,
		create: { to: '/larval-surveillance/inspections/create', label: 'Create Inspection' },
	} as const;
}

/** What the reader has narrowed by, as the tile layer wants it. */
function inspectionTileFilters(set: InspectionFilterState): InspectionTileFilters {
	return {
		...(set.wetness === 'all' ? {} : { isWet: set.wetness === 'wet' }),
		...whenAny('densities', set.densities),
		...whenOn('positiveOnly', set.positiveOnly),
		...whenAny('habitatTypeIds', set.typeIds),
		...whenAny('inspectedByProfileIds', set.inspectorIds),
		...whenAny('regionIds', set.regionIds),
		...whenText('dateFrom', set.dateFrom),
		...whenText('dateTo', set.dateTo),
	};
}

/** The same filters as the list endpoint's query string. */
function inspectionQueryParams(bbox: string | null, filters: InspectionTileFilters) {
	return mapQueryParams({
		bbox,
		isWet: filters.isWet,
		density: filters.densities,
		positive: filters.positiveOnly,
		habitatTypeId: filters.habitatTypeIds,
		inspectedBy: filters.inspectedByProfileIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	});
}

/**
 * The filter set, held on the URL.
 *
 * A deep link from the overview's "view on map" actions, a shared link, and
 * Back out of a record all land on the same view, so the state cannot live in
 * the component. What the component wants back is a plain value and a setter per
 * filter, and building those out of one patch function is the bulk of what this
 * route would otherwise do before it renders anything.
 */
function useInspectionFilterState(defaultFrom: string, today: string) {
	const filterDefaults = useMemo<InspectionSearchFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			water: 'all',
			density: new Set(),
			positive: false,
			types: new Set(),
			inspectors: new Set(),
			regions: new Set(),
		}),
		[defaultFrom, today],
	);
	const {
		filters: query,
		setFilters,
		reset,
		activeCount,
	} = useSearchFilters(filterDefaults, inspectionFilterCodecs, DATE_RANGE_COUNTING);
	const setWetness = useCallback((next: WetFilter) => setFilters({ water: next }), [setFilters]);
	const setDensities = useCallback(
		(next: ReadonlySet<LarvalDensity>) =>
			setFilters({ density: next as InspectionSearchFilters['density'] }),
		[setFilters],
	);
	const setPositiveOnly = useCallback(
		(next: boolean) => setFilters({ positive: next }),
		[setFilters],
	);
	const setTypeIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ types: next }),
		[setFilters],
	);
	const setInspectorIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ inspectors: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const state: InspectionFilterState = {
		dateFrom: query.from,
		dateTo: query.to,
		densities: query.density as ReadonlySet<LarvalDensity>,
		inspectorIds: query.inspectors,
		positiveOnly: query.positive,
		regionIds: query.regions,
		typeIds: query.types,
		wetness: query.water,
	};
	const set: InspectionFilterSetters = {
		setDensities,
		setInspectorIds,
		setPositiveOnly,
		setRegionIds,
		setTypeIds,
		setWetness,
	};
	return { activeCount, reset, set, setFilters, state };
}

/** What the reader has narrowed the list by. */
interface InspectionFilterState {
	readonly dateFrom: string;
	readonly dateTo: string;
	readonly densities: ReadonlySet<LarvalDensity>;
	readonly inspectorIds: ReadonlySet<string>;
	readonly positiveOnly: boolean;
	readonly regionIds: ReadonlySet<string>;
	readonly typeIds: ReadonlySet<string>;
	readonly wetness: WetFilter;
}

/** One setter per filter, each patching the URL. */
interface InspectionFilterSetters {
	readonly setDensities: (next: ReadonlySet<LarvalDensity>) => void;
	readonly setInspectorIds: (next: ReadonlySet<string>) => void;
	readonly setPositiveOnly: (next: boolean) => void;
	readonly setRegionIds: (next: ReadonlySet<string>) => void;
	readonly setTypeIds: (next: ReadonlySet<string>) => void;
	readonly setWetness: (next: WetFilter) => void;
}

/** The catalogs the filter controls offer, and the names their chips read by. */
interface InspectionFilterOptions {
	readonly habitatTypes: ReturnType<typeof useHabitatTypeOptions>['options'];
	readonly personnel: ReturnType<typeof usePersonnelOptions>;
	readonly regions: ReturnType<typeof useRegionOptions>;
	readonly typeNameById: ReadonlyMap<string, string>;
}

function InspectionsExplorerRoute() {
	const { defaultFrom, today } = useDefaultWindow();
	const {
		activeCount: activeFilterCount,
		reset,
		set,
		setFilters,
		state,
	} = useInspectionFilterState(defaultFrom, today);
	const { dateFrom, dateTo, densities, wetness } = state;

	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const filterOptions = useInspectionFilterOptions();
	const filters = useMemo(() => inspectionTileFilters(state), [state]);
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });
	const { paged, selected } = useInspectionResults({ filters, map, selectedId });
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } = paged;
	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const inspectionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);
	const legend = useMemo(() => inspectionLegend(wetness, densities), [wetness, densities]);

	const isDefaultRange = dateFrom === defaultFrom && dateTo === today;
	const resetDates = useCallback(
		() => setFilters({ from: defaultFrom, to: today }),
		[setFilters, defaultFrom, today],
	);
	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<InspectionFilters
					activeFilterCount={activeFilterCount}
					dateRange={dateRange}
					isDefaultRange={isDefaultRange}
					onClearAll={clearAll}
					onResetDates={resetDates}
					options={filterOptions}
					set={set}
					state={state}
				/>
			}
			footer={
				<ExplorerPagination
					noun={RESULT_NOUN}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			onResetFilters={clearAll}
			heading={inspectionsHeading(total, isLoading)}
			map={
				<InspectionMap
					inspectionLayer={inspectionLayer}
					legend={legend}
					onSelect={setSelectedId}
					onMapReady={handleMapReady}
					panel={panel}
					selected={selected}
				/>
			}
			panel={panel}
			results={{
				...INSPECTION_RESULTS_COPY,
				rows,
				isError,
				onRetry: retry,
				renderRow: (inspection) => (
					<InspectionListItem
						inspection={inspection}
						key={inspection.id}
						onSelect={setSelectedId}
						selectedId={selectedId}
						typeNameById={filterOptions.typeNameById}
					/>
				),
			}}
		/>
	);
}

/** The map, and the card for whichever inspection is selected. */
function InspectionMap({
	inspectionLayer,
	legend,
	onSelect,
	onMapReady,
	panel,
	selected,
}: {
	readonly inspectionLayer:
		| NonNullable<Parameters<typeof MapCanvas>[0]['inspectionLayer']>
		| undefined;
	readonly legend: readonly MapLegendEntry[] | undefined;
	readonly onSelect: (id: string | null) => void;
	readonly onMapReady: (map: MapboxMap) => void;
	readonly panel: ReturnType<typeof useExplorerPanel>;
	readonly selected: InspectionSite | null;
}) {
	return (
		<>
			<MapCanvas
				contextMenu={{ create: [MAP_CREATE_TARGETS.inspection, MAP_CREATE_TARGETS.habitat] }}
				controls={{ layers: false, measure: true, readout: true }}
				fitToData
				inset={panel.inset}
				{...(inspectionLayer === undefined ? {} : { inspectionLayer })}
				{...(legend === undefined ? {} : { legend })}
				onMapReady={onMapReady}
				searchWidth={panel.width}
			/>
			{selected === null ? null : (
				<InspectionMapCard id={selected.id} inset={panel.inset} onClose={() => onSelect(null)} />
			)}
		</>
	);
}

/**
 * The chip row, or nothing when no filter is set.
 *
 * It takes the filter values and their setters rather than a callback per chip,
 * so the card above it hands over what it already holds instead of building
 * twelve closures on every render.
 */
function InspectionActiveFilters({
	activeFilterCount,
	isDefaultRange,
	onClearAll,
	onResetDates,
	options,
	set,
	state,
}: {
	readonly activeFilterCount: number;
	readonly isDefaultRange: boolean;
	readonly onClearAll: () => void;
	readonly onResetDates: () => void;
	readonly options: InspectionFilterOptions;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
}) {
	if (activeFilterCount === 0) {
		return null;
	}
	const { densities, inspectorIds, regionIds, typeIds } = state;
	return (
		<ActiveFilters
			densities={densities}
			from={state.dateFrom}
			inspectorIds={inspectorIds}
			isDefaultRange={isDefaultRange}
			onClearAll={onClearAll}
			onClearPositive={() => set.setPositiveOnly(false)}
			onClearWetness={() => set.setWetness('all')}
			onResetDates={onResetDates}
			onToggleDensity={(value) => set.setDensities(toggle(densities, value))}
			onToggleInspector={(id) => set.setInspectorIds(toggle(inspectorIds, id))}
			onToggleRegion={(id) => set.setRegionIds(toggle(regionIds, id))}
			onToggleType={(id) => set.setTypeIds(toggle(typeIds, id))}
			personnelNameById={options.personnel.nameById}
			positiveOnly={state.positiveOnly}
			regionIds={regionIds}
			regionNameById={options.regions.nameById}
			to={state.dateTo}
			typeIds={typeIds}
			typeNameById={options.typeNameById}
			wetness={state.wetness}
		/>
	);
}

/** The four multi-selects, which have no state of their own to hold. */
function InspectionFilterGrid({
	options,
	set,
	state,
}: {
	readonly options: InspectionFilterOptions;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
}) {
	return (
		<FilterGrid>
			<ToggleFilter
				label="Larvae found only"
				onChange={set.setPositiveOnly}
				value={state.positiveOnly}
			/>
			<MultiSelectFilter
				empty="No habitat types"
				label="Habitat type"
				onChange={set.setTypeIds}
				options={options.habitatTypes}
				selected={state.typeIds}
			/>
			<MultiSelectFilter
				empty="No people"
				label="Inspector"
				onChange={set.setInspectorIds}
				options={options.personnel.options}
				selected={state.inspectorIds}
			/>
			<MultiSelectFilter
				empty="No regions"
				label="Region"
				onChange={set.setRegionIds}
				options={options.regions.options}
				selected={state.regionIds}
			/>
		</FilterGrid>
	);
}

/** The filter card's contents, and the chips that undo what is set. */
function InspectionFilters({
	activeFilterCount,
	dateRange,
	isDefaultRange,
	onClearAll,
	onResetDates,
	options,
	set,
	state,
}: {
	readonly activeFilterCount: number;
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly isDefaultRange: boolean;
	readonly onClearAll: () => void;
	readonly onResetDates: () => void;
	readonly options: InspectionFilterOptions;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
}) {
	return (
		<>
			<DateRangeFilter {...dateRange} />

			<SegmentedFilter
				label="Water"
				onChange={set.setWetness}
				options={WETNESS_OPTIONS}
				value={state.wetness}
			/>

			<DensityFilter onChange={set.setDensities} selected={state.densities} />

			<InspectionFilterGrid options={options} set={set} state={state} />

			<InspectionActiveFilters
				activeFilterCount={activeFilterCount}
				isDefaultRange={isDefaultRange}
				onClearAll={onClearAll}
				onResetDates={onResetDates}
				options={options}
				set={set}
				state={state}
			/>
		</>
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
	regionIds,
	regionNameById,
	onResetDates,
	onClearWetness,
	onToggleDensity,
	onClearPositive,
	onToggleType,
	onToggleInspector,
	onToggleRegion,
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
	readonly regionIds: ReadonlySet<string>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly onResetDates: () => void;
	readonly onClearWetness: () => void;
	readonly onToggleDensity: (value: LarvalDensity) => void;
	readonly onClearPositive: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onToggleInspector: (id: string) => void;
	readonly onToggleRegion: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
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
			{[...regionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => onToggleRegion(id)}
				/>
			))}
		</ActiveFilterBar>
	);
}

function InspectionListItem({
	inspection,
	typeNameById,
	selectedId,
	onSelect,
}: {
	readonly inspection: InspectionSite;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const isSelected = inspection.id === selectedId;
	const typeName = resolveTypeName(inspection, typeNameById);
	const label = siteLabel(inspection);
	const when = formatListDate(inspection.inspectionDate);
	return (
		<ExplorerRow
			/*
			 * Life stages only. The density pill beside them repeated the dot at the
			 * left of the row, which is already the density and already the colour the
			 * map paints this site. What stages were found is the one thing neither the
			 * dot nor the key says.
			 *
			 * `null` rather than omitted on a site with no stages, so every row in the
			 * rail keeps the same shape whether or not this one found anything.
			 */
			badges={
				inspection.isWet && hasAnyLifeStage(inspection) ? (
					<LifeStageStrip size="sm" stages={inspection} />
				) : null
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
