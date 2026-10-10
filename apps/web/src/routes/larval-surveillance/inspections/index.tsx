import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow, FilterGrid } from '../../../components/explorer';
import { DeclaredFilterChips, filterFields } from '../../../components/explorer/declared-filters';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { densityLabel, hasAnyLifeStage } from '../../../components/larval-display';
import { inspectionFilterDeclarations } from '../../../components/larval-surveillance/inspection-filters';
import type { InspectionListing } from '../../../components/larval-surveillance/inspection-listing';
import { InspectionMapCard } from '../../../components/larval-surveillance/inspection-map-card';
import { inspectionSummaryGroupings } from '../../../components/larval-surveillance/inspections/inspection-summary';
import { inspectionLegend } from '../../../components/larval-surveillance/inspections/legend';
import {
	type InspectionFilters,
	inspectionFilterCodecs,
	inspectionRecordSet,
} from '../../../components/larval-surveillance/inspections-search';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	MAP_CREATE_TARGETS,
} from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import {
	type RecordSetFilterBinding,
	useRecordSetFilters,
} from '../../../hooks/explorer/use-record-set-filters';
import { useInspectionCatalogs } from '../../../hooks/larval-surveillance/use-inspection-catalogs';
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
	const binding = useRecordSetFilters(inspectionRecordSet, 'map');
	const { activeCount: activeFilterCount, clearAll, filters, setFilters } = binding;

	const panel = useExplorerPanel();

	const routeSearch = Route.useSearch();

	const catalogs = useInspectionCatalogs();
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
	}: ExplorerResource<InspectionListing> = useExplorerResource({
		set: inspectionRecordSet,
		binding,
		tileset: 'inspections',
		rowKey: 'inspection',
		summarize: true,
	});
	const [clustered] = useMapClustering();
	const legend = inspectionLegend(filters.water, filters.density, clustered);

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={inspectionRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<InspectionFilterCard binding={binding} />}
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
							<DeclaredFilterChips binding={binding} declarations={inspectionFilterDeclarations} />
						}
						groupings={
							summary.data === null
								? []
								: inspectionSummaryGroupings({
										summary: summary.data,
										filters,
										setFilters,
										typeNameById: catalogs.typeNameById,
										inspectorNameById: catalogs.personnelNameById,
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
						typeNameById={catalogs.typeNameById}
					/>
				),
			}}
		/>
	);
}

/** The filter card's contents, and the chips that undo what is set. */
function InspectionFilterCard({
	binding,
}: {
	readonly binding: RecordSetFilterBinding<InspectionFilters>;
}) {
	const fields = filterFields(inspectionFilterDeclarations, binding);
	return (
		<>
			{fields.dates}
			{fields.water}
			{fields.density}
			<FilterGrid>
				{fields.positive}
				{fields.types}
				{fields.inspectors}
				{fields.regions}
			</FilterGrid>
			<DeclaredFilterChips binding={binding} declarations={inspectionFilterDeclarations} />
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
