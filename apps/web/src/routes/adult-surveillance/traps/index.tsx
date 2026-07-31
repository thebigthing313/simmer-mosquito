import type { CollectionMethodRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	CheckCircle2Icon,
	CircleIcon,
	MapPinnedIcon,
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
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	toggle,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, type TrapTileFilters } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { trapDisplayName } from '../-adult-display';
import { TrapMapCard } from '../-trap-map-card';

export const Route = createFileRoute('/adult-surveillance/traps/')({
	component: TrapsExplorerRoute,
});

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

const PAGE_SIZE = 50;

function TrapsExplorerRoute() {
	const [searchInput, setSearchInput] = useState('');
	const search = useDebouncedValue(searchInput.trim().toLowerCase(), 200);
	const [status, setStatus] = useState<StatusFilter>('active');
	const [methodIds, setMethodIds] = useState<ReadonlySet<string>>(() => new Set());
	const [page, setPage] = useState(0);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);

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
			...(search.length > 0 ? { search } : {}),
		}),
		[methodIds, status, search],
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

	const hasActiveFilters = status !== 'active' || methodIds.size > 0 || search.length > 0;
	const clearAll = useCallback(() => {
		setStatus('active');
		setMethodIds(new Set());
		setSearchInput('');
	}, []);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
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
							<Button asChild size="sm">
								<Link to="/adult-surveillance/traps/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Add Trap
								</Link>
							</Button>
						</div>
					</div>

					<SearchField onChange={setSearchInput} value={searchInput} />

					<SegmentedFilter
						label="Status"
						onChange={setStatus}
						options={STATUS_OPTIONS}
						value={status}
					/>

					<MultiSelectFilter
						empty="No collection methods"
						label="Method"
						onChange={setMethodIds}
						options={methods.map((method) => ({ id: method.id, label: method.name }))}
						selected={methodIds}
					/>

					{hasActiveFilters ? (
						<div className="flex flex-wrap items-center gap-1.5">
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
							<button
								className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={clearAll}
								type="button"
							>
								Clear all
							</button>
						</div>
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
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[60px]" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No traps match</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Loosen the filters, or add a trap to start collecting.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((trap) => (
				<TrapListItem
					isSelected={trap.id === selectedId}
					key={trap.id}
					methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					trap={trap}
				/>
			))}
		</ul>
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

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const handle = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(handle);
	}, [value, delayMs]);
	return debounced;
}
