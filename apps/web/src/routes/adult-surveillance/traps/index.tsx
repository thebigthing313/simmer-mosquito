import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { CheckCircle2Icon, CircleIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	ActiveFilterBar,
	ExplorerHeader,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	mapQueryParams,
	ResultList,
	SegmentedFilter,
	toggle,
	useCollectionMethodOptions,
	useFlyToSelection,
	usePagedMapResource,
	useRegionOptions,
	useSelectedMapRecord,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MAP_CREATE_TARGETS, MapCanvas, type TrapTileFilters } from '../../../components/map';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import {
	choiceParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
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

const RESULT_NOUN = { one: 'trap', many: 'traps' };
const PATH = '/map/traps';

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
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { options: methodOptions, nameById: methodNameById } = useCollectionMethodOptions();
	const regions = useRegionOptions();

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
	const params = useMemo(
		() =>
			mapQueryParams({
				collectionMethodId: filters.collectionMethodIds,
				status:
					filters.isActive === undefined ? undefined : filters.isActive ? 'active' : 'inactive',
				search: filters.search,
				regionId: filters.regionIds,
			}),
		[filters],
	);

	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<TrapSite>({
			path: PATH,
			rowsKey: 'traps',
			label: 'Traps',
			params,
		});

	const selected = useSelectedMapRecord<TrapSite>({
		path: PATH,
		rowKey: 'trap',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

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
						contextMenu={{ create: [MAP_CREATE_TARGETS.trap] }}
						controls={{ layers: false, measure: true, readout: true }}
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
				<ExplorerHeader
					create={{
						to: '/adult-surveillance/traps/create',
						label: 'Add Trap',
						minimum: 'manager',
					}}
					isLoading={isLoading}
					noun={RESULT_NOUN}
					title="Traps"
					total={total}
				>
					<SearchField
						label="Search traps by name or code"
						onChange={setSearchInput}
						placeholder="Search name or code…"
						value={searchInput}
					/>

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
							options={methodOptions}
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
				</ExplorerHeader>

				<TrapResults
					isError={isError}
					isLoading={isLoading}
					onRetry={retry}
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

// --- filter controls --------------------------------------------------------

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

// --- results ----------------------------------------------------------------

function TrapResults({
	rows,
	isLoading,
	isError,
	onRetry,
	selectedId,
	methodNameById,
	onSelect,
}: {
	readonly rows: readonly TrapSite[];
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly onRetry: () => void;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ResultList
			emptyDescription="Loosen the filters, or add a trap to start collecting."
			emptyTitle="No traps match"
			isError={isError}
			isLoading={isLoading}
			onRetry={onRetry}
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
