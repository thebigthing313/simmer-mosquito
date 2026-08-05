import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { HabitatRow, HabitatTypeRow, TagRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	CircleIcon,
	MapPinnedIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	toggle,
	useEntityTags,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type HabitatTileFilters, MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import {
	choiceParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
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

const PAGE_SIZE = 50;

const NO_TAGS: readonly TagRow[] = [];

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
	const [page, setPage] = useState(0);

	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);
	const { rows: tags } = useCollectionRows<TagRow>(webCollections.tags);
	const regions = useRegionOptions();

	const typeNameById = useMemo(
		() => new Map(habitatTypes.map((type) => [type.id, type.name])),
		[habitatTypes],
	);
	const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

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

	const bounds = useMapBounds(map);
	const { rows, total, isLoading } = useVisibleHabitats(bounds, filters, page);
	// Tags for the rows actually on screen, so the subset request stays small.
	const pageHabitatIds = useMemo(() => rows.map((habitat) => habitat.id), [rows]);
	const tagsByHabitatId = useEntityTags('habitat', pageHabitatIds);
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
	const fallbackSelected = useSelectedHabitat(selectedId, visibleById);
	const selectedHabitat =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected habitat whenever the resolved selection changes.
	useEffect(() => {
		if (map === null || selectedHabitat?.lat == null || selectedHabitat.lng == null) {
			return;
		}
		map.flyTo({
			center: [selectedHabitat.lng, selectedHabitat.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 700,
		});
	}, [map, selectedHabitat?.lat, selectedHabitat?.lng]);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const habitatLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		status !== 'active' ||
		access !== 'all' ||
		typeIds.size > 0 ||
		tagIds.size > 0 ||
		regionIds.size > 0;
	const clearAll = useCallback(() => {
		clearSearchInput();
		reset();
	}, [clearSearchInput, reset]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false, measure: true }}
						fitToData
						habitatLayer={habitatLayer}
						onMapReady={handleMapReady}
					/>
					{selectedHabitat === null ? null : (
						<HabitatMapCard
							detailTo="/larval-surveillance/habitats/$id"
							id={selectedHabitat.id}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-baseline justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Habitats</h1>
						<ResultMeta isLoading={isLoading} total={total} />
					</div>

					<SearchField value={searchInput} onChange={setSearchInput} />

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
							options={habitatTypes.map((type) => ({ id: type.id, label: type.name }))}
							selected={typeIds}
							onChange={setTypeIds}
						/>
						<MultiSelectFilter
							label="Tags"
							empty="No tags"
							options={tags.map((tag) => ({ id: tag.id, label: tag.tagName }))}
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

					{hasActiveFilters ? (
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
				</div>

				<HabitatResults
					isLoading={isLoading}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
					tagsByHabitatId={tagsByHabitatId}
					typeNameById={typeNameById}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="habitats"
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

function SearchField({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="relative">
			<SearchIcon
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
			/>
			<Input
				aria-label="Search habitats by name or description"
				className="pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search name or description…"
				type="search"
				value={value}
			/>
			{value.length > 0 ? (
				<button
					aria-label="Clear search"
					className="-translate-y-1/2 absolute top-1/2 right-2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => onChange('')}
					type="button"
				>
					<XIcon aria-hidden="true" className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}

function SegmentedFilter<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	readonly label: string;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="w-12 shrink-0 font-medium text-muted-foreground text-xs">{label}</span>
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
	readonly tagById: ReadonlyMap<string, TagRow>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly onClearStatus: () => void;
	readonly onClearAccess: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onToggleTag: (id: string) => void;
	readonly onToggleRegion: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
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
						label={tag?.tagName ?? 'Unknown tag'}
						onRemove={() => onToggleTag(id)}
					/>
				);
			})}
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

function HabitatResults({
	rows,
	isLoading,
	selectedId,
	typeNameById,
	tagsByHabitatId,
	onSelect,
}: {
	readonly rows: readonly HabitatRow[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagsByHabitatId: ReadonlyMap<string, readonly TagRow[]>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[58px]" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No habitats in view</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Pan or zoom the map, or loosen the filters to bring habitats into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((habitat) => (
				<HabitatListItem
					habitat={habitat}
					isSelected={habitat.id === selectedId}
					key={habitat.id}
					onSelect={onSelect}
					tags={tagsByHabitatId.get(habitat.id) ?? NO_TAGS}
					typeName={resolveTypeName(habitat, typeNameById)}
				/>
			))}
		</ul>
	);
}

function HabitatListItem({
	habitat,
	typeName,
	tags,
	isSelected,
	onSelect,
}: {
	readonly habitat: HabitatRow;
	readonly typeName: string;
	readonly tags: readonly TagRow[];
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
function habitatSwatch(habitat: HabitatRow): { readonly color: string; readonly label: string } {
	if (habitat.isInaccessible) {
		return { color: 'var(--danger)', label: 'Inaccessible' };
	}
	return habitat.isActive
		? { color: 'var(--success)', label: 'Active' }
		: { color: 'var(--muted-foreground)', label: 'Inactive' };
}

function StatusBadge({ habitat }: { readonly habitat: HabitatRow }) {
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

function _StatusDot({ habitat }: { readonly habitat: HabitatRow }) {
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

function useVisibleHabitats(
	bounds: BoundingBox | null,
	filters: HabitatTileFilters,
	page: number,
): { readonly rows: readonly HabitatRow[]; readonly total: number; readonly isLoading: boolean } {
	const bbox = bounds === null ? null : formatBoundingBox(bounds);
	const query = useQuery({
		enabled: bbox !== null,
		queryKey: ['habitats', 'visible', bbox, filters, page],
		queryFn: ({ signal }) => fetchVisibleHabitats(bounds, filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

// Fallback for a selection outside the current bbox list: the habitat's non-geometry
// fields (all this page shows) live on the synced `habitats` row, so resolve it from
// a single-id on-demand subset instead of a `/map/habitats/{id}` fetch. Geometry
// (geojson) isn't needed here — only the centroid lat/lng, which sync on the row.
function useSelectedHabitat(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, HabitatRow>,
): HabitatRow | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const result = useLiveQuery(
		{
			gcTime: selectedHabitatGcTimeMs,
			// An unmatchable id keeps the subset live (and empty) when the selection is
			// already in the visible list or nothing is selected.
			query: (query) =>
				query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) => eq(habitat.id, needsFetch ? selectedId : UNMATCHABLE_ID)),
		},
		[needsFetch ? selectedId : null],
	);

	if (!needsFetch) {
		return null;
	}
	const rows = (result.data ?? []) as readonly HabitatRow[];
	return rows[0] ?? null;
}

async function fetchVisibleHabitats(
	bounds: BoundingBox | null,
	filters: HabitatTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: HabitatRow[]; readonly total: number }> {
	if (bounds === null) {
		return { rows: [], total: 0 };
	}
	const url = new URL('/map/habitats', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(normalizeBounds(bounds)));
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.isActive !== undefined) {
		url.searchParams.set('isActive', String(filters.isActive));
	}
	if (filters.isInaccessible !== undefined) {
		url.searchParams.set('isInaccessible', String(filters.isInaccessible));
	}
	if (filters.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		url.searchParams.set('habitatTypeId', filters.habitatTypeIds.join(','));
	}
	if (filters.tagIds !== undefined && filters.tagIds.length > 0) {
		url.searchParams.set('tagId', filters.tagIds.join(','));
	}
	if (filters.regionIds !== undefined && filters.regionIds.length > 0) {
		url.searchParams.set('regionId', filters.regionIds.join(','));
	}
	if (filters.search !== undefined && filters.search.length > 0) {
		url.searchParams.set('search', filters.search);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Habitats request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly habitats?: HabitatRow[];
		readonly total?: number;
	};
	return { rows: body.habitats ?? [], total: body.total ?? 0 };
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

function resolveTypeName(habitat: HabitatRow, typeNameById: ReadonlyMap<string, string>): string {
	if (habitat.habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(habitat.habitatTypeId) ?? 'Unknown type';
}

function habitatName(habitat: HabitatRow): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

function _tagColorStyle(color: string | null): CSSProperties | null {
	if (color === null || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
		return null;
	}
	const hex = color.trim();
	return {
		borderColor: hexWithAlpha(hex, 0.36),
		backgroundColor: hexWithAlpha(hex, 0.14),
		color: hex,
	};
}

function hexWithAlpha(hex: string, alpha: number): string {
	const normalized =
		hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
	const value = Math.round(alpha * 255)
		.toString(16)
		.padStart(2, '0');
	return `${normalized}${value}`;
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
