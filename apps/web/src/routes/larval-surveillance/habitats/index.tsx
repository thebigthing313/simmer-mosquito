import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { HabitatFilterFields } from '../../../components/larval-surveillance/habitats/habitat-filters';
import { HabitatMapCard } from '../../../components/larval-surveillance/habitats/habitat-map-card';
import { HabitatSurfaceSwitch } from '../../../components/larval-surveillance/habitats/habitat-surface-switch';
import {
	habitatFilterCodecs,
	habitatListParams,
	habitatTileFilters,
	sharedHabitatSearch,
} from '../../../components/larval-surveillance/habitats/habitats-search';
import { habitatLegend } from '../../../components/larval-surveillance/habitats/legend';
import {
	HABITAT_STATUS_COLORS,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
} from '../../../components/map';
import { useEntityTags } from '../../../hooks/explorer/use-entity-tags';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useHabitatTypeOptions } from '../../../hooks/explorer/use-habitat-type-options';
import { useHabitatFilterState } from '../../../hooks/larval-surveillance/use-habitat-filter-state';
import type { Tag } from '../../../hooks/queries/tag-view';
import { habitatName, habitatTypeName } from '../../../lib/habitat-name';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/habitats/')({
	component: HabitatsExplorerRoute,
	validateSearch: searchValidator(habitatFilterCodecs),
});

const PATH = '/map/habitats';

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
	const binding = useHabitatFilterState();
	const { filters: query, activeCount: activeFilterCount, clearAll } = binding;
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { nameById: typeNameById } = useHabitatTypeOptions();

	const filters = habitatTileFilters(query);
	const legend = habitatLegend(query.status, query.access);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedHabitatSearch(Route.useSearch());

	const layer: MapTileLayer = {
		kind: 'habitats',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const layers: readonly MapTileLayer[] = [layer];
	const {
		rows,
		total,
		isLoading,
		isError,
		retry,
		page,
		pageCount,
		setPage,
		selected: selectedHabitat,
		empty,
	} = useExplorerResource<HabitatListRow>({
		path: PATH,
		rowsKey: 'habitats',
		rowKey: 'habitat',
		recordType: 'habitat',
		params: habitatListParams(filters),
		layer,
		map,
		selectedId,
	});
	// Tags for the rows actually on screen, so the subset request stays small.
	const pageHabitatIds = rows.map((habitat) => habitat.id);
	const { byId: tagsByHabitatId } = useEntityTags('habitat', pageHabitatIds);

	const handleMapReady = (instance: MapboxMap) => setMap(instance);

	return (
		<ExplorerMapPage
			actions={<HabitatSurfaceSwitch compact current="map" search={carried} />}
			activeFilterCount={activeFilterCount}
			filters={<HabitatFilterFields binding={binding} />}
			footer={
				<ExplorerPagination
					noun={recordNoun('habitat')}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: recordNoun('habitat').titleMany,
				icon: HabitatIcon,
				total,
				isLoading,
				create: { to: '/larval-surveillance/habitats/create', label: createLabel('habitat') },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.habitat, MAP_CREATE_TARGETS.inspection] }}
						controls={{ measure: true, readout: true }}
						fitToData
						inset={panel.inset}
						layers={layers}
						legend={legend}
						onMapReady={handleMapReady}
						searchWidth={panel.width}
					/>
					{selectedHabitat === null ? null : (
						<HabitatMapCard
							detailTo="/larval-surveillance/habitats/$id"
							id={selectedHabitat.id}
							inset={panel.inset}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				skeletonClassName: 'h-[58px]',
				empty,
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
