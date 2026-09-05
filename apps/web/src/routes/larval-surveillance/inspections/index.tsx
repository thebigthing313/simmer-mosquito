import type { LarvalDensity } from '@simmer-mosquito/domain';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
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
	useMapBoundsParam,
	usePagedMapResource,
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
	type MapTileLayer,
} from '../../../components/map';
import { adhocLabel } from '../../../lib/coordinate-label';
import {
	DATE_RANGE_COUNTING,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import {
	DensityFilter,
	type InspectionCatalogs,
	InspectionFilterChips,
	type InspectionFilterSetters,
	type InspectionFilterState,
	useInspectionCatalogs,
	useInspectionFilterState,
	WETNESS_OPTIONS,
} from '../-inspection-filters';
import { InspectionMapCard } from '../-inspection-map-card';
import {
	type InspectionFilters as InspectionSearchFilters,
	inspectionFilterCodecs,
} from '../-inspections-search';
import { formatListDate } from '../-overview-data';
import { inspectionLegend } from './-legend';

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

const PATH = '/map/inspections';

/** The catalogs the filter controls read from: the shared two, plus Region. */
function useInspectionFilterOptions(): InspectionFilterOptions {
	const catalogs = useInspectionCatalogs();
	const regions = useRegionOptions();
	return { catalogs, regions };
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

/** The catalogs the filter controls offer, and the names their chips read by. */
interface InspectionFilterOptions {
	readonly catalogs: InspectionCatalogs;
	readonly regions: ReturnType<typeof useRegionOptions>;
}

function InspectionsExplorerRoute() {
	const {
		activeCount: activeFilterCount,
		defaults,
		reset,
		set,
		setFilters,
		state,
		today,
	} = useInspectionFilterState(DATE_RANGE_COUNTING, 'last-30-days');
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
	const layers = useMemo(
		(): readonly MapTileLayer[] => [
			{
				kind: 'inspections',
				serverUrl: getServerUrl(),
				filters,
				selectedId,
				onSelectFeature: setSelectedId,
			},
		],
		[filters, selectedId],
	);
	const legend = useMemo(() => inspectionLegend(wetness, densities), [wetness, densities]);

	const resetDates = useCallback(
		() => setFilters({ from: defaults.from, to: defaults.to }),
		[setFilters, defaults.from, defaults.to],
	);
	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<InspectionFilters
					activeFilterCount={activeFilterCount}
					dateRange={dateRange}
					defaults={defaults}
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
					layers={layers}
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
						typeNameById={filterOptions.catalogs.typeNameById}
					/>
				),
			}}
		/>
	);
}

/** The map, and the card for whichever inspection is selected. */
function InspectionMap({
	layers,
	legend,
	onSelect,
	onMapReady,
	panel,
	selected,
}: {
	readonly layers: readonly MapTileLayer[];
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
				controls={{ measure: true, readout: true }}
				fitToData
				inset={panel.inset}
				layers={layers}
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
 * The six chips both surfaces share come from `InspectionFilterChips`; Region is
 * the map's own filter, so its chips are passed as children and land after them.
 */
function InspectionActiveFilters({
	activeFilterCount,
	defaults,
	onClearAll,
	onResetDates,
	options,
	set,
	state,
}: {
	readonly activeFilterCount: number;
	readonly defaults: InspectionSearchFilters;
	readonly onClearAll: () => void;
	readonly onResetDates: () => void;
	readonly options: InspectionFilterOptions;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
}) {
	if (activeFilterCount === 0) {
		return null;
	}
	const { regionIds } = state;
	return (
		<InspectionFilterChips
			catalogs={options.catalogs}
			defaults={defaults}
			onClearAll={onClearAll}
			onResetDates={onResetDates}
			set={set}
			state={state}
		>
			{[...regionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={options.regions.nameById.get(id) ?? 'Unknown region'}
					onRemove={() => set.setRegionIds(toggle(regionIds, id))}
				/>
			))}
		</InspectionFilterChips>
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
				options={options.catalogs.habitatTypes}
				selected={state.typeIds}
			/>
			<MultiSelectFilter
				empty="No people"
				label="Inspector"
				onChange={set.setInspectorIds}
				options={options.catalogs.personnel}
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
	defaults,
	onClearAll,
	onResetDates,
	options,
	set,
	state,
}: {
	readonly activeFilterCount: number;
	readonly dateRange: ReturnType<typeof useDateRangeFilters>;
	readonly defaults: InspectionSearchFilters;
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
				defaults={defaults}
				onClearAll={onClearAll}
				onResetDates={onResetDates}
				options={options}
				set={set}
				state={state}
			/>
		</>
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
