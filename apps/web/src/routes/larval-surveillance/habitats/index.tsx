import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	CircleIcon,
	ComponentIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	mapQueryParams,
	SegmentedFilter,
	toggle,
	useEntityTags,
	useExplorerPanel,
	useFlyToSelection,
	useHabitatTypeOptions,
	useMapBoundsParam,
	usePagedMapResource,
	useRegionOptions,
	useTagOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type HabitatTileFilters, MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import type { Tag } from '../../../hooks/queries/tag-view';
import { habitats } from '../../../lib/collections/habitats';
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

type StatusFilter = 'all' | 'active' | 'inactive';
type AccessFilter = 'all' | 'accessible' | 'inaccessible';

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

/**
 * A Habitat as this list shows one.
 *
 * Named here rather than reused from the row types, because the rows arrive from
 * `/map/habitats` — a REST read that aliases its columns to camelCase — and this
 * is exactly the six fields the list, the badges and the map fly-to need. The
 * collection projects into the same shape (see {@link useSelectedHabitat}), so
 * both sources satisfy one type and the page never asks which it is holding.
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
	} = useSearchFilters(HABITAT_FILTER_DEFAULTS, HABITAT_FILTER_CODECS);
	const { search, status, access, typeIds, tagIds, regions: regionIds } = query;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(search, commitSearch);
	const setStatus = useCallback((next: StatusFilter) => setFilters({ status: next }), [setFilters]);
	const setAccess = useCallback((next: AccessFilter) => setFilters({ access: next }), [setFilters]);
	const setTypeIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ typeIds: next }),
		[setFilters],
	);
	const setTagIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ tagIds: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { options: habitatTypes, nameById: typeNameById } = useHabitatTypeOptions();
	const { options: tags, byId: tagById } = useTagOptions();
	const regions = useRegionOptions();

	const filters = useMemo<HabitatTileFilters>(
		() => ({
			...(status === 'all' ? {} : { isActive: status === 'active' }),
			...(access === 'all' ? {} : { isInaccessible: access === 'inaccessible' }),
			...(typeIds.size > 0 ? { habitatTypeIds: [...typeIds] } : {}),
			...(tagIds.size > 0 ? { tagIds: [...tagIds] } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(search.length > 0 ? { search } : {}),
		}),
		[status, access, typeIds, tagIds, regionIds, search],
	);

	const bbox = useMapBoundsParam(map);
	const params = useMemo(
		() =>
			mapQueryParams({
				bbox,
				isActive: filters.isActive,
				isInaccessible: filters.isInaccessible,
				habitatTypeId: filters.habitatTypeIds,
				tagId: filters.tagIds,
				regionId: filters.regionIds,
				search: filters.search,
			}),
		[bbox, filters],
	);
	const { rows, total, isLoading, page, pageCount, setPage } = usePagedMapResource<HabitatListRow>({
		path: PATH,
		rowsKey: 'habitats',
		label: 'Habitats',
		params,
		enabled: bbox !== null,
	});
	// Tags for the rows actually on screen, so the subset request stays small.
	const pageHabitatIds = useMemo(() => rows.map((habitat) => habitat.id), [rows]);
	const { byId: tagsByHabitatId } = useEntityTags('habitat', pageHabitatIds);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedHabitat(selectedId, visibleById);
	const selectedHabitat =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);
	useFlyToSelection(map, selectedHabitat, panel.inset);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const habitatLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const activeFilterCount =
		(status === 'active' ? 0 : 1) +
		(access === 'all' ? 0 : 1) +
		typeIds.size +
		tagIds.size +
		regionIds.size;
	const clearAll = useCallback(() => {
		clearSearchInput();
		reset();
	}, [clearSearchInput, reset]);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<SearchField
						label="Search habitats by name or description"
						onChange={setSearchInput}
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

					<div className="grid grid-cols-2 gap-2">
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
					</div>

					{activeFilterCount > 0 ? (
						<ActiveFilters
							status={status}
							access={access}
							typeIds={typeIds}
							tagIds={tagIds}
							regionIds={regionIds}
							typeNameById={typeNameById}
							tagById={tagById}
							regionNameById={regions.nameById}
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
					noun="habitats"
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Habitats',
				icon: ComponentIcon,
				total,
				isLoading,
				create: { to: '/larval-surveillance/habitats/create', label: 'Add Habitat' },
			}}
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.habitat, MAP_CREATE_TARGETS.inspection] }}
						controls={{ layers: false, measure: true }}
						fitToData
						habitatLayer={habitatLayer}
						inset={panel.inset}
						onMapReady={handleMapReady}
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
	status,
	access,
	typeIds,
	tagIds,
	regionIds,
	typeNameById,
	tagById,
	regionNameById,
	onClearStatus,
	onClearAccess,
	onToggleType,
	onToggleTag,
	onToggleRegion,
	onClearAll,
}: {
	readonly status: StatusFilter;
	readonly access: AccessFilter;
	readonly typeIds: ReadonlySet<string>;
	readonly tagIds: ReadonlySet<string>;
	readonly regionIds: ReadonlySet<string>;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagById: ReadonlyMap<string, Tag>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly onClearStatus: () => void;
	readonly onClearAccess: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onToggleTag: (id: string) => void;
	readonly onToggleRegion: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
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
			badges={<StatusBadge habitat={habitat} />}
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

/** The dot colour a habitat draws in: inaccessible, inactive, or working. */
function habitatSwatch(habitat: HabitatListRow): {
	readonly color: string;
	readonly label: string;
} {
	if (habitat.isInaccessible) {
		return { color: 'var(--danger)', label: 'Inaccessible' };
	}
	return habitat.isActive
		? { color: 'var(--success)', label: 'Active' }
		: { color: 'var(--muted-foreground)', label: 'Inactive' };
}

function StatusBadge({ habitat }: { readonly habitat: HabitatListRow }) {
	if (habitat.isInaccessible) {
		return (
			<Badge tone="danger" variant="outline">
				<AlertTriangleIcon aria-hidden="true" />
				Inaccessible
			</Badge>
		);
	}
	if (habitat.isActive) {
		return (
			<Badge tone="success" variant="outline">
				<CheckCircle2Icon aria-hidden="true" />
				Active
			</Badge>
		);
	}
	return (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}

function _StatusDot({ habitat }: { readonly habitat: HabitatListRow }) {
	const color = habitat.isInaccessible
		? 'bg-[var(--danger)]'
		: habitat.isActive
			? 'bg-[var(--success)]'
			: 'bg-muted-foreground/50';
	return <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', color)} />;
}

// --- data hooks -------------------------------------------------------------

// `habitats` is on-demand; keep the selected-habitat subset warm briefly on unmount.
const selectedHabitatGcTimeMs = 30_000;
// A syntactically valid uuid that matches no row — keeps the single-id subset live
// (and empty) when nothing needs the fallback fetch.
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Fallback for a selection outside the current bbox list.
 *
 * Every field this page shows lives on the synced `habitats` row, so a selection
 * the list does not hold is resolved from a single-id on-demand subset rather than
 * a `/map/habitats/{id}` fetch. Geometry is not needed — only the centroid, which
 * syncs on the row.
 *
 * This is where the two read paths meet, and the projection below is the seam. The
 * list rows come from `/map/habitats`, which aliases every column to camelCase
 * server-side; the collection speaks Postgres. Naming {@link HabitatListRow} is
 * what lets one page hold both: the REST rows satisfy it structurally, and the
 * query is projected into it. When `/map/*` is settled one of the two sides goes
 * away, and this projection is the thing to delete.
 */
function useSelectedHabitat(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, HabitatListRow>,
): HabitatListRow | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const result = useLiveQuery(
		{
			gcTime: selectedHabitatGcTimeMs,
			// An unmatchable id keeps the subset live (and empty) when the selection is
			// already in the visible list or nothing is selected.
			query: (query) =>
				query
					.from({ habitat: habitats })
					.where(({ habitat }) => eq(habitat.id, needsFetch ? selectedId : UNMATCHABLE_ID))
					.select(({ habitat }) => ({
						id: habitat.id,
						habitatName: habitat.habitat_name,
						habitatTypeId: habitat.habitat_type_id,
						isActive: habitat.is_active,
						isInaccessible: habitat.is_inaccessible,
						lat: habitat.lat,
						lng: habitat.lng,
					})),
		},
		[needsFetch ? selectedId : null],
	);

	if (!needsFetch) {
		return null;
	}
	return result.data[0] ?? null;
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
