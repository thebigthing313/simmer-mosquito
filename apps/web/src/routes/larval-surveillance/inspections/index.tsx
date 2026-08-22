import type { LarvalDensity } from '@simmer-mosquito/sync';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerHeader,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	mapQueryParams,
	ResultList,
	SegmentedFilter,
	ToggleFilter,
	toggle,
	useDateRangeFilters,
	useFlyToSelection,
	useHabitatTypeOptions,
	useMapBoundsParam,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
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
	MAP_CREATE_TARGETS,
	MapCanvas,
} from '../../../components/map';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { adhocLabel } from '../../../lib/coordinate-label';
import { searchValidator, useSearchFilters } from '../../../lib/search-filters';
import { InspectionMapCard } from '../-inspection-map-card';
import { type InspectionFilters, inspectionFilterCodecs } from '../-inspections-search';
import {
	addDaysToDateString,
	formatListDate,
	formatMonthDay,
	todayInTimeZone,
} from '../-overview-data';

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

type WetFilter = 'all' | 'wet' | 'dry';

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

function InspectionsExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);

	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);

	// The filter state lives in the URL, so a deep link from the overview's "view
	// on map" actions, a shared link, and Back out of a record all land on the
	// same view.
	const filterDefaults = useMemo<InspectionFilters>(
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
	} = useSearchFilters(filterDefaults, inspectionFilterCodecs);
	const dateFrom = query.from;
	const dateTo = query.to;
	const wetness = query.water;
	const densities = query.density as ReadonlySet<LarvalDensity>;
	const positiveOnly = query.positive;
	const typeIds = query.types;
	const inspectorIds = query.inspectors;
	const regionIds = query.regions;
	const setWetness = useCallback((next: WetFilter) => setFilters({ water: next }), [setFilters]);
	const setDensities = useCallback(
		(next: ReadonlySet<LarvalDensity>) =>
			setFilters({ density: next as InspectionFilters['density'] }),
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
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { options: habitatTypes, nameById: typeNameById } = useHabitatTypeOptions();

	const filters = useMemo<InspectionTileFilters>(
		() => ({
			...(wetness === 'all' ? {} : { isWet: wetness === 'wet' }),
			...(densities.size > 0 ? { densities: [...densities] } : {}),
			...(positiveOnly ? { positiveOnly: true } : {}),
			...(typeIds.size > 0 ? { habitatTypeIds: [...typeIds] } : {}),
			...(inspectorIds.size > 0 ? { inspectedByProfileIds: [...inspectorIds] } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[wetness, densities, positiveOnly, typeIds, inspectorIds, regionIds, dateFrom, dateTo],
	);

	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const bbox = useMapBoundsParam(map);
	const params = useMemo(
		() =>
			mapQueryParams({
				bbox,
				isWet: filters.isWet,
				density: filters.densities,
				positive: filters.positiveOnly,
				habitatTypeId: filters.habitatTypeIds,
				inspectedBy: filters.inspectedByProfileIds,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[bbox, filters],
	);
	const { rows, total, isLoading, page, pageCount, setPage } = usePagedMapResource<InspectionSite>({
		path: PATH,
		rowsKey: 'inspections',
		label: 'Inspections',
		params,
		enabled: bbox !== null,
	});

	const selected = useSelectedMapRecord<InspectionSite>({
		path: PATH,
		rowKey: 'inspection',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

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
		inspectorIds.size > 0 ||
		regionIds.size > 0;

	const resetDates = useCallback(
		() => setFilters({ from: defaultFrom, to: today }),
		[setFilters, defaultFrom, today],
	);

	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.inspection, MAP_CREATE_TARGETS.habitat] }}
						controls={{ layers: false, measure: true, readout: true }}
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
				<ExplorerHeader
					create={{ to: '/larval-surveillance/inspections/create', label: 'Record' }}
					isLoading={isLoading}
					title="Inspections"
					total={total}
				>
					<DateRangeFilter {...dateRange} />

					<SegmentedFilter
						label="Water"
						onChange={setWetness}
						options={WETNESS_OPTIONS}
						value={wetness}
					/>

					<DensityFilter onChange={setDensities} selected={densities} />

					<div className="flex flex-wrap items-center gap-2">
						<ToggleFilter
							label="Larvae found only"
							onChange={setPositiveOnly}
							value={positiveOnly}
						/>
						<MultiSelectFilter
							empty="No habitat types"
							label="Habitat type"
							onChange={setTypeIds}
							options={habitatTypes}
							selected={typeIds}
						/>
						<MultiSelectFilter
							empty="No people"
							label="Inspector"
							onChange={setInspectorIds}
							options={personnel.options}
							selected={inspectorIds}
						/>
						<MultiSelectFilter
							empty="No regions"
							label="Region"
							onChange={setRegionIds}
							options={regions.options}
							selected={regionIds}
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
							onToggleRegion={(id) => setRegionIds(toggle(regionIds, id))}
							onToggleType={(id) => setTypeIds(toggle(typeIds, id))}
							personnelNameById={personnel.nameById}
							positiveOnly={positiveOnly}
							regionIds={regionIds}
							regionNameById={regions.nameById}
							to={dateTo}
							typeIds={typeIds}
							typeNameById={typeNameById}
							wetness={wetness}
						/>
					) : null}
				</ExplorerHeader>

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
	return (
		<ResultList
			emptyDescription="Pan or zoom the map, widen the time window, or loosen the filters to bring inspections into range."
			emptyTitle="No inspections in view"
			isLoading={isLoading}
			rows={rows}
			skeletonClassName="h-[64px]"
		>
			{(inspection) => (
				<InspectionListItem
					inspection={inspection}
					isSelected={inspection.id === selectedId}
					key={inspection.id}
					onSelect={onSelect}
					typeName={resolveTypeName(inspection, typeNameById)}
				/>
			)}
		</ResultList>
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
