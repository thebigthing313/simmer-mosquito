import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { DeclaredFilterChips } from '../../../components/explorer/declared-filters';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import {
	HabitatFilterFields,
	habitatFilterDeclarations,
} from '../../../components/larval-surveillance/habitats/habitat-filters';
import { HabitatMapCard } from '../../../components/larval-surveillance/habitats/habitat-map-card';
import { habitatSummaryGroupings } from '../../../components/larval-surveillance/habitats/habitat-summary';
import {
	habitatFilterCodecs,
	habitatRecordSet,
} from '../../../components/larval-surveillance/habitats/habitats-search';
import { habitatLegend } from '../../../components/larval-surveillance/habitats/legend';
import { HABITAT_STATUS_COLORS, MAP_CREATE_TARGETS } from '../../../components/map';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { catalogs } from '../../../hooks/queries/catalog-register';
import type { Tag } from '../../../hooks/queries/tag-view';
import { habitatName, habitatTypeName } from '../../../lib/habitat-name';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/habitats/')({
	component: HabitatsExplorerRoute,
	validateSearch: searchValidator(habitatFilterCodecs),
});

const NO_TAGS: readonly Tag[] = [];

const HabitatIcon = iconRegistry.entities.habitat.icon;

/**
 * A Habitat as this list shows one.
 *
 * Named here rather than reused from the row types, because the rows arrive from
 * `/map/habitats`, a REST read that aliases its columns to camelCase, and this is
 * exactly the six fields the list, the badges and the map fly-to need. A selection
 * the page is not holding is read back from `/map/habitats/{id}`, which answers in
 * the same shape, so the page never asks where a row came from.
 */
interface HabitatListRow {
	readonly id: string;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly lat: number;
	readonly lng: number;
}

function HabitatsExplorerRoute() {
	const binding = useRecordSetFilters(habitatRecordSet, 'map');
	const { filters: query, activeCount: activeFilterCount, clearAll, setFilters } = binding;
	const panel = useExplorerPanel();

	const { nameById: typeNameById } = useCatalogOptions(catalogs.habitatTypes);

	const [clustered] = useMapClustering();
	const legend = habitatLegend(query.status, query.access, clustered);
	const routeSearch = Route.useSearch();

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
	}: ExplorerResource<HabitatListRow> = useExplorerResource({
		set: habitatRecordSet,
		binding,
		summarize: true,
	});
	// Tags for the rows actually on screen, so the subset request stays small.
	// None while the summary stands in for the rows.
	const pageHabitatIds = summary.isShown ? [] : rows.map((habitat) => habitat.id);
	const { byId: tagsByHabitatId } = useEntityTags('habitat', pageHabitatIds);

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={habitatRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<HabitatFilterFields binding={binding} />}
			heading={{
				title: recordNoun('habitat').titleMany,
				icon: HabitatIcon,
				total,
				isLoading,
				create: { to: '/larval-surveillance/habitats/create', label: createLabel('habitat') },
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => (
						<HabitatMapCard detailTo="/larval-surveillance/habitats/$id" {...props} />
					)}
					contextMenu={{ create: [MAP_CREATE_TARGETS.habitat, MAP_CREATE_TARGETS.inspection] }}
					legend={legend}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				skeletonClassName: 'h-[58px]',
				empty,
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1244).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={
							<DeclaredFilterChips binding={binding} declarations={habitatFilterDeclarations} />
						}
						groupings={
							summary.data === null
								? []
								: habitatSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										typeNameById,
									})
						}
						recordType="habitat"
						state={summary}
					/>
				) : undefined,
				renderRow: (habitat) => (
					<HabitatListItem
						habitat={habitat}
						isSelected={habitat.id === selectedId}
						key={habitat.id}
						onSelect={setSelectedId}
						tags={tagsByHabitatId.get(habitat.id) ?? NO_TAGS}
						typeName={habitatTypeName(habitat.habitatTypeId, typeNameById)}
					/>
				),
			}}
		/>
	);
}

function HabitatListItem({
	habitat,
	typeName,
	tags,
	isSelected,
	onSelect,
}: {
	readonly habitat: HabitatListRow;
	readonly typeName: string;
	readonly tags: readonly Tag[];
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const name = habitatName(habitat);
	return (
		<ExplorerRow
			detailLabel={`View details for ${name}`}
			detailLink={{ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(habitat.id)}
			selectLabel={`Show ${name} on the map`}
			subtitle={typeName}
			swatch={habitatSwatch(habitat)}
			tags={tags}
			title={name}
			titleLink={{ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } }}
		/>
	);
}

/**
 * The dot colour a habitat draws in, read from what the map paints it.
 *
 * It carried a status pill beside it as well, which said the same thing twice in
 * a row that has ~200px for the habitat's name. The dot and the key above it are
 * the status now, so the dot has to be the map's own colour: the same expression
 * order too, inaccessible before active, or a habitat that is both draws red on
 * the map and green in the rail.
 */
function habitatSwatch(habitat: HabitatListRow): {
	readonly color: string;
	readonly label: string;
} {
	if (habitat.isInaccessible) {
		return { color: HABITAT_STATUS_COLORS.inaccessible, label: 'Inaccessible' };
	}
	return habitat.isActive
		? { color: HABITAT_STATUS_COLORS.active, label: 'Active' }
		: { color: HABITAT_STATUS_COLORS.inactive, label: 'Inactive' };
}
