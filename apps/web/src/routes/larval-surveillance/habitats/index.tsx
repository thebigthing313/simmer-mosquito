import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	SegmentedFilter,
	toggle,
	useEntityTags,
	useExplorerPanel,
	useExplorerResource,
	useHabitatTypeOptions,
	useRegionOptions,
	useTagOptions,
	whenAny,
	whenText,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	HABITAT_STATUS_COLORS,
	type HabitatTileFilters,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
} from '../../../components/map';
import type { Tag } from '../../../hooks/queries/tag-view';
import { recordNoun } from '../../../lib/record-nouns';
import {
	choiceParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { HabitatMapCard } from '../../-habitat-map-card';
import type { AccessFilter, StatusFilter } from './-legend';
import { habitatLegend } from './-legend';

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];
const ACCESS_VALUES: readonly AccessFilter[] = ['all', 'accessible', 'inaccessible'];

interface HabitatFilters {
	readonly search: string;
	readonly status: StatusFilter;
	readonly access: AccessFilter;
	readonly typeIds: ReadonlySet<string>;
	readonly tagIds: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const HABITAT_FILTER_DEFAULTS: HabitatFilters = {
	search: '',
	status: 'active',
	access: 'all',
	typeIds: new Set(),
	tagIds: new Set(),
	regions: new Set(),
};

const HABITAT_FILTER_CODECS: FilterCodecs<HabitatFilters> = {
	search: textParam,
	status: choiceParam(STATUS_VALUES, HABITAT_FILTER_DEFAULTS.status),
	access: choiceParam(ACCESS_VALUES, HABITAT_FILTER_DEFAULTS.access),
	typeIds: idSetParam,
	tagIds: idSetParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/larval-surveillance/habitats/')({
	component: HabitatsExplorerRoute,
	validateSearch: searchValidator(HABITAT_FILTER_CODECS),
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
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(HABITAT_FILTER_DEFAULTS, HABITAT_FILTER_CODECS);
	const { search, status, access, typeIds, tagIds, regions: regionIds } = query;
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(search, commitSearch);
	const setStatus = (next: StatusFilter) => setFilters({ status: next });
	const setAccess = (next: AccessFilter) => setFilters({ access: next });
	const setTypeIds = (next: ReadonlySet<string>) => setFilters({ typeIds: next });
	const setTagIds = (next: ReadonlySet<string>) => setFilters({ tagIds: next });
	const setRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { options: habitatTypes, nameById: typeNameById } = useHabitatTypeOptions();
	const { options: tags, byId: tagById } = useTagOptions();
	const regions = useRegionOptions();

	const filters: HabitatTileFilters = {
		...(status === 'all' ? {} : { isActive: status === 'active' }),
		...(access === 'all' ? {} : { isInaccessible: access === 'inaccessible' }),
		...whenAny('habitatTypeIds', typeIds),
		...whenAny('tagIds', tagIds),
		...whenAny('regionIds', regionIds),
		...whenText('search', search),
	};

	const legend = habitatLegend(status, access);

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
	} = useExplorerResource<HabitatListRow>({
		path: PATH,
		rowsKey: 'habitats',
		rowKey: 'habitat',
		recordType: 'habitat',
		params: {
			isActive: filters.isActive,
			isInaccessible: filters.isInaccessible,
			habitatTypeId: filters.habitatTypeIds,
			tagId: filters.tagIds,
			regionId: filters.regionIds,
			search: filters.search,
		},
		map,
		selectedId,
	});
	// Tags for the rows actually on screen, so the subset request stays small.
	const pageHabitatIds = rows.map((habitat) => habitat.id);
	const { byId: tagsByHabitatId } = useEntityTags('habitat', pageHabitatIds);

	const handleMapReady = (instance: MapboxMap) => setMap(instance);
	const layers: readonly MapTileLayer[] = [
		{
			kind: 'habitats',
			serverUrl: getServerUrl(),
			filters,
			selectedId,
			onSelectFeature: setSelectedId,
		},
	];

	const clearAll = () => {
		clearSearchInput();
		reset();
	};
	// Both halves: the field the operator is looking at, and the committed term
	// on the URL that is actually cutting the list. Clearing only the field
	// leaves the chip up and the results filtered.
	const clearSearch = () => {
		clearSearchInput();
		commitSearch('');
	};

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<SearchInput
						label="Search habitats by name or description"
						onChange={(event) => setSearchInput(event.target.value)}
						onClear={clearSearch}
						placeholder="Search name or description…"
						value={searchInput}
					/>

					<div className="grid gap-2">
						<SegmentedFilter
							label="Status"
							value={status}
							onChange={setStatus}
							options={STATUS_OPTIONS}
						/>
						<SegmentedFilter
							label="Access"
							value={access}
							onChange={setAccess}
							options={ACCESS_OPTIONS}
						/>
					</div>

					<FilterGrid>
						<MultiSelectFilter
							label="Habitat type"
							empty="No habitat types"
							options={habitatTypes}
							selected={typeIds}
							onChange={setTypeIds}
						/>
						<MultiSelectFilter
							label="Tags"
							empty="No tags"
							options={tags}
							selected={tagIds}
							onChange={setTagIds}
						/>
						<MultiSelectFilter
							label="Region"
							empty="No regions"
							options={regions.options}
							selected={regionIds}
							onChange={setRegionIds}
						/>
					</FilterGrid>

					{activeFilterCount > 0 ? (
						<ActiveFilters
							search={search}
							status={status}
							access={access}
							typeIds={typeIds}
							tagIds={tagIds}
							regionIds={regionIds}
							typeNameById={typeNameById}
							tagById={tagById}
							regionNameById={regions.nameById}
							onClearSearch={clearSearch}
							onClearStatus={() => setStatus('active')}
							onClearAccess={() => setAccess('all')}
							onToggleType={(id) => setTypeIds(toggle(typeIds, id))}
							onToggleTag={(id) => setTagIds(toggle(tagIds, id))}
							onToggleRegion={(id) => setRegionIds(toggle(regionIds, id))}
							onClearAll={clearAll}
						/>
					) : null}
				</>
			}
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
				create: { to: '/larval-surveillance/habitats/create', label: 'Create Habitat' },
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
				emptyTitle: 'No habitats in view',
				emptyDescription:
					'Pan or zoom the map, or loosen the filters to bring habitats into range.',
				renderRow: (habitat) => (
					<HabitatListItem
						habitat={habitat}
						isSelected={habitat.id === selectedId}
						key={habitat.id}
						onSelect={setSelectedId}
						tags={tagsByHabitatId.get(habitat.id) ?? NO_TAGS}
						typeName={resolveTypeName(habitat, typeNameById)}
					/>
				),
			}}
		/>
	);
}

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

const ACCESS_OPTIONS: readonly { readonly value: AccessFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'accessible', label: 'Accessible' },
	{ value: 'inaccessible', label: 'Inaccessible' },
];

function ActiveFilters({
	search,
	status,
	access,
	typeIds,
	tagIds,
	regionIds,
	typeNameById,
	tagById,
	regionNameById,
	onClearSearch,
	onClearStatus,
	onClearAccess,
	onToggleType,
	onToggleTag,
	onToggleRegion,
	onClearAll,
}: {
	readonly search: string;
	readonly status: StatusFilter;
	readonly access: AccessFilter;
	readonly typeIds: ReadonlySet<string>;
	readonly tagIds: ReadonlySet<string>;
	readonly regionIds: ReadonlySet<string>;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagById: ReadonlyMap<string, Tag>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly onClearSearch: () => void;
	readonly onClearStatus: () => void;
	readonly onClearAccess: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onToggleTag: (id: string) => void;
	readonly onToggleRegion: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
			{search.length > 0 ? (
				<FilterChip label={`Search: ${search}`} onRemove={onClearSearch} />
			) : null}
			{status !== 'active' ? (
				<FilterChip
					label={`Status: ${status === 'all' ? 'All' : 'Inactive'}`}
					onRemove={onClearStatus}
				/>
			) : null}
			{access !== 'all' ? (
				<FilterChip
					label={`Access: ${access === 'accessible' ? 'Accessible' : 'Inaccessible'}`}
					onRemove={onClearAccess}
				/>
			) : null}
			{[...regionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => onToggleRegion(id)}
				/>
			))}
			{[...typeIds].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={typeNameById.get(id) ?? 'Unknown type'}
					onRemove={() => onToggleType(id)}
				/>
			))}
			{[...tagIds].map((id) => {
				const tag = tagById.get(id);
				return (
					<FilterChip
						color={tag?.color ?? null}
						key={`tag-${id}`}
						label={tag?.name ?? 'Unknown tag'}
						onRemove={() => onToggleTag(id)}
					/>
				);
			})}
		</ActiveFilterBar>
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
	return (
		<ExplorerRow
			detailLabel={`View details for ${habitatName(habitat)}`}
			detailLink={{ to: '/larval-surveillance/habitats/$id', params: { id: habitat.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(habitat.id)}
			selectLabel={`Show ${habitatName(habitat)} on the map`}
			subtitle={typeName}
			swatch={habitatSwatch(habitat)}
			tags={tags}
			title={habitatName(habitat)}
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

// --- helpers ----------------------------------------------------------------

function resolveTypeName(
	habitat: HabitatListRow,
	typeNameById: ReadonlyMap<string, string>,
): string {
	if (habitat.habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(habitat.habitatTypeId) ?? 'Unknown type';
}

function habitatName(habitat: HabitatListRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}
