import type { CollectionMethodRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	CheckCircle2Icon,
	CircleIcon,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	ActiveFilterBar,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	ResultList,
	SegmentedFilter,
	toggle,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, type TrapTileFilters } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
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
import { trapDisplayName } from '../-adult-display';
import { TrapMapCard } from '../-trap-map-card';

interface TrapSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
}

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];

interface TrapFilters {
	readonly search: string;
	readonly status: StatusFilter;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const TRAP_FILTER_DEFAULTS: TrapFilters = {
	search: '',
	status: 'active',
	methods: new Set(),
	regions: new Set(),
};

const TRAP_FILTER_CODECS: FilterCodecs<TrapFilters> = {
	search: textParam,
	status: choiceParam(STATUS_VALUES, TRAP_FILTER_DEFAULTS.status),
	methods: idSetParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/adult-surveillance/traps/')({
	component: TrapsExplorerRoute,
	validateSearch: searchValidator(TRAP_FILTER_CODECS),
});

const PAGE_SIZE = 50;

function TrapsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a trap
	// both land on the list the operator had narrowed to.
	const {
		filters: query,
		setFilters,
		reset,
	} = useSearchFilters(TRAP_FILTER_DEFAULTS, TRAP_FILTER_CODECS);
	const search = query.search.toLowerCase();
	const status = query.status;
	const methodIds = query.methods;
	const regionIds = query.regions;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(query.search, commitSearch, 200);
	const setStatus = useCallback((next: StatusFilter) => setFilters({ status: next }), [setFilters]);
	const setMethodIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ methods: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const [page, setPage] = useState(0);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const regions = useRegionOptions();

	const methodNameById = useMemo(
		() => new Map(methods.map((method) => [method.id, method.name])),
		[methods],
	);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (no selection / no search) drop out.
	const filters = useMemo<TrapTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { collectionMethodIds: [...methodIds] } : {}),
			...(status === 'all' ? {} : { isActive: status === 'active' }),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(search.length > 0 ? { search } : {}),
		}),
		[methodIds, status, regionIds, search],
	);

	// A new filter set always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the filter set.
	useEffect(() => {
		setPage(0);
	}, [filters]);

	const { rows, total, isLoading } = useTrapsPage(filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	// Clamp if the row count shrinks under the current page (e.g. after a delete).
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedTrap(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected trap whenever the resolved selection changes.
	useEffect(() => {
		if (map === null || selected == null) {
			return;
		}
		map.flyTo({
			center: [selected.lng, selected.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 700,
		});
	}, [map, selected]);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const trapLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		status !== 'active' || methodIds.size > 0 || regionIds.size > 0 || search.length > 0;
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
						onMapReady={handleMapReady}
						trapLayer={trapLayer}
					/>
					{selected === null ? null : (
						<TrapMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Traps</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<WriteOnly minimum="manager">
								<Button asChild size="sm">
									<Link to="/adult-surveillance/traps/create">
										<PlusIcon aria-hidden="true" data-icon="inline-start" />
										Add Trap
									</Link>
								</Button>
							</WriteOnly>
						</div>
					</div>

					<SearchField onChange={setSearchInput} value={searchInput} />

					<SegmentedFilter
						label="Status"
						onChange={setStatus}
						options={STATUS_OPTIONS}
						value={status}
					/>

					<div className="grid grid-cols-2 gap-2">
						<MultiSelectFilter
							empty="No collection methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
							selected={methodIds}
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
						<ActiveFilterBar onClearAll={clearAll}>
							{status !== 'active' ? (
								<FilterChip
									label={`Status: ${status === 'all' ? 'All' : 'Inactive'}`}
									onRemove={() => setStatus('active')}
								/>
							) : null}
							{[...methodIds].map((id) => (
								<FilterChip
									key={id}
									label={methodNameById.get(id) ?? 'Unknown method'}
									onRemove={() => setMethodIds(toggle(methodIds, id))}
								/>
							))}
							{[...regionIds].map((id) => (
								<FilterChip
									key={`region-${id}`}
									label={regions.nameById.get(id) ?? 'Unknown region'}
									onRemove={() => setRegionIds(toggle(regionIds, id))}
								/>
							))}
						</ActiveFilterBar>
					) : null}
				</div>

				<TrapResults
					isLoading={isLoading}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="traps"
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

// --- data hooks -------------------------------------------------------------

function useTrapsPage(
	filters: TrapTileFilters,
	page: number,
): { readonly rows: readonly TrapSite[]; readonly total: number; readonly isLoading: boolean } {
	const query = useQuery({
		queryKey: ['traps', 'page', filters, page],
		queryFn: ({ signal }) => fetchTrapsPage(filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedTrap(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, TrapSite>,
): TrapSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['traps', 'detail', selectedId],
		queryFn: ({ signal }) => fetchTrapById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchTrapsPage(
	filters: TrapTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: TrapSite[]; readonly total: number }> {
	const url = new URL('/map/traps', getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		url.searchParams.set('collectionMethodId', filters.collectionMethodIds.join(','));
	}
	if (filters.isActive === true) {
		url.searchParams.set('status', 'active');
	} else if (filters.isActive === false) {
		url.searchParams.set('status', 'inactive');
	}
	if (filters.search !== undefined) {
		url.searchParams.set('search', filters.search);
	}
	if (filters.regionIds !== undefined && filters.regionIds.length > 0) {
		url.searchParams.set('regionId', filters.regionIds.join(','));
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Traps request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly traps?: TrapSite[];
		readonly total?: number;
	};
	return { rows: body.traps ?? [], total: body.total ?? 0 };
}

async function fetchTrapById(id: string, signal: AbortSignal): Promise<TrapSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/traps/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly trap?: TrapSite };
	return body.trap ?? null;
}

// --- filter controls --------------------------------------------------------

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None' : total === 1 ? '1 trap' : `${total} traps`}
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
				aria-label="Search traps by name or code"
				className="pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search name or code…"
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

// --- results ----------------------------------------------------------------

function TrapResults({
	rows,
	isLoading,
	selectedId,
	methodNameById,
	onSelect,
}: {
	readonly rows: readonly TrapSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ResultList
			emptyDescription="Loosen the filters, or add a trap to start collecting."
			emptyTitle="No traps match"
			isLoading={isLoading}
			rows={rows}
		>
			{(trap) => (
				<TrapListItem
					isSelected={trap.id === selectedId}
					key={trap.id}
					methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					trap={trap}
				/>
			)}
		</ResultList>
	);
}

function TrapListItem({
	trap,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly trap: TrapSite;
	readonly methodName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ExplorerRow
			badges={<StatusBadge isActive={trap.isActive} />}
			detailLabel={`View details for ${trapDisplayName(trap)}`}
			detailLink={{ to: '/adult-surveillance/traps/$id', params: { id: trap.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(trap.id)}
			selectLabel={`Show ${trapDisplayName(trap)} on the map`}
			subtitle={methodName}
			swatch={{
				color: trap.isActive ? 'var(--success)' : 'var(--muted-foreground)',
				label: trap.isActive ? 'Active' : 'Inactive',
			}}
			title={trapDisplayName(trap)}
			titleLink={{ to: '/adult-surveillance/traps/$id', params: { id: trap.id } }}
		/>
	);
}

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}

function _StatusDot({ isActive }: { readonly isActive: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'size-2 shrink-0 rounded-full',
				isActive ? 'bg-[var(--success)]' : 'bg-muted-foreground/50',
			)}
		/>
	);
}

// --- helpers ----------------------------------------------------------------
