import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	ToggleFilter,
	toggle,
} from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { densityLabel, hasAnyLifeStage } from '../../../components/larval-display';
import {
	DensityFilter,
	InspectionFilterChips,
	type InspectionFilterSetters,
	type InspectionFilterState,
	WETNESS_OPTIONS,
} from '../../../components/larval-surveillance/inspection-filters';
import {
	INSPECTIONS_PATH,
	type InspectionListing,
	inspectionQueryParams,
	inspectionTileFilters,
} from '../../../components/larval-surveillance/inspection-listing';
import { InspectionMapCard } from '../../../components/larval-surveillance/inspection-map-card';
import { inspectionSummaryGroupings } from '../../../components/larval-surveillance/inspections/inspection-summary';
import { inspectionLegend } from '../../../components/larval-surveillance/inspections/legend';
import {
	type InspectionFilters as InspectionSearchFilters,
	inspectionFilterCodecs,
	inspectionRecordSet,
} from '../../../components/larval-surveillance/inspections-search';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	MAP_CREATE_TARGETS,
} from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import {
	type InspectionFilterOptions,
	useInspectionFilterOptions,
} from '../../../hooks/larval-surveillance/use-inspection-filter-options';
import { useInspectionFilterState } from '../../../hooks/larval-surveillance/use-inspection-filter-state';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { habitatLabel } from '../../../lib/coordinate-label';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const InspectionEntityIcon = iconRegistry.entities.inspection.icon;

export const Route = createFileRoute('/larval-surveillance/inspections/')({
	component: InspectionsExplorerRoute,
	validateSearch: searchValidator(inspectionFilterCodecs),
});

/** The placeholder's height, matched to the two-line row it stands in for. */
const INSPECTION_SKELETON_CLASS = 'h-[64px]';

/** The panel's title row: what the surface is, and how much of it matched. */
function inspectionsHeading(total: number, isLoading: boolean) {
	return {
		title: recordNoun('inspection').titleMany,
		icon: InspectionEntityIcon,
		total,
		isLoading,
		create: { to: '/larval-surveillance/inspections/create', label: createLabel('inspection') },
	} as const;
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
	} = useInspectionFilterState('map');
	const { dateFrom, dateTo, densities, wetness } = state;

	const panel = useExplorerPanel();

	const routeSearch = Route.useSearch();

	const filterOptions = useInspectionFilterOptions();
	const filters = inspectionTileFilters(state);
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });
	const {
		rows,
		total,
		isLoading,
		isError,
		retry,
		empty,
		summary,
		canvas,
		selectedId,
		setSelectedId,
	} = useExplorerResource<InspectionListing>({
		path: INSPECTIONS_PATH,
		rowsKey: 'inspections',
		rowKey: 'inspection',
		recordType: 'inspection',
		params: inspectionQueryParams(filters),
		tiles: { kind: 'inspections', filters },
		summarize: true,
	});
	const [clustered] = useMapClustering();
	const legend = inspectionLegend(wetness, densities, clustered);

	const resetDates = () => setFilters({ from: defaults.from, to: defaults.to });
	const clearAll = reset;

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={inspectionRecordSet} />
			}
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
			onResetFilters={clearAll}
			heading={inspectionsHeading(total, isLoading)}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <InspectionMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.inspection, MAP_CREATE_TARGETS.habitat] }}
					legend={legend}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				skeletonClassName: INSPECTION_SKELETON_CLASS,
				empty,
				rows,
				isError,
				onRetry: retry,
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1369).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={
							<InspectionActiveFilters
								activeFilterCount={activeFilterCount}
								defaults={defaults}
								onClearAll={clearAll}
								onResetDates={resetDates}
								options={filterOptions}
								set={set}
								state={state}
							/>
						}
						groupings={
							summary.data === null
								? []
								: inspectionSummaryGroupings({
										summary: summary.data,
										state,
										set,
										typeNameById: filterOptions.catalogs.typeNameById,
										inspectorNameById: filterOptions.catalogs.personnelNameById,
									})
						}
						recordType="inspection"
						state={summary}
					/>
				) : undefined,
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

/** What the filter card and the chip row both read, the chips also drawing above the summary. */
interface InspectionFilterProps {
	readonly activeFilterCount: number;
	readonly defaults: InspectionSearchFilters;
	readonly onClearAll: () => void;
	readonly onResetDates: () => void;
	readonly options: InspectionFilterOptions;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
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
}: InspectionFilterProps) {
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
}: InspectionFilterProps & { readonly dateRange: ReturnType<typeof useDateRangeFilters> }) {
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
	readonly inspection: InspectionListing;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly selectedId: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const isSelected = inspection.id === selectedId;
	const typeName = resolveTypeName(inspection, typeNameById);
	const label = habitatLabel(inspection, {
		addressName: inspection.addressDisplayName,
		fallback: 'One-off inspection',
	});
	const when = formatListDate(inspection.inspectionDate);
	/*
	 * Life stages only. The density pill beside them repeated the dot at the
	 * left of the row, which is already the density and already the colour the
	 * map paints this habitat. What stages were found is the one thing neither
	 * the dot nor the key says, and an inspection that found none passes
	 * nothing, so the row lays out no line for it.
	 */
	const facts: RecordBadgeFacts = {
		category: 'inspection',
		result: {
			isWet: inspection.isWet,
			density: inspection.density,
			stages: hasAnyLifeStage(inspection) ? inspection : null,
		},
	};
	return (
		<ExplorerRow
			badges={recordBadges(facts, 'dot')}
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
function inspectionSwatch(inspection: InspectionListing): {
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
	inspection: InspectionListing,
	typeNameById: ReadonlyMap<string, string>,
): string {
	if (inspection.habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(inspection.habitatTypeId) ?? 'Unknown type';
}
