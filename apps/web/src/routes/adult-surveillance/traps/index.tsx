import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { CheckCircle2Icon, CircleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	mapQueryParams,
	SegmentedFilter,
	toggle,
	useCollectionMethodOptions,
	useExplorerPanel,
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
const TrapEntityIcon = iconRegistry.entities.trap.icon;

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
	const panel = useExplorerPanel();

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

	const activeFilterCount =
		(status === 'active' ? 0 : 1) + methodIds.size + regionIds.size + (search.length > 0 ? 1 : 0);
	const clearAll = useCallback(() => {
		clearSearchInput();
		reset();
	}, [clearSearchInput, reset]);
	// Both halves: the field the operator is looking at, and the committed term on
	// the URL that is actually cutting the list.
	const clearSearch = useCallback(() => {
		clearSearchInput();
		commitSearch('');
	}, [clearSearchInput, commitSearch]);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
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

					<FilterGrid>
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
					</FilterGrid>

					{activeFilterCount > 0 ? (
						<ActiveFilterBar onClearAll={clearAll}>
							{status !== 'active' ? (
								<FilterChip
									label={`Status: ${status === 'all' ? 'All' : 'Inactive'}`}
									onRemove={() => setStatus('active')}
								/>
							) : null}
							{search.length > 0 ? (
								<FilterChip label={`Search: ${query.search}`} onRemove={clearSearch} />
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
				</>
			}
			footer={
				<ExplorerPagination
					noun="traps"
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Traps',
				icon: TrapEntityIcon,
				total,
				isLoading,
				noun: RESULT_NOUN,
				create: {
					to: '/adult-surveillance/traps/create',
					label: 'Add Trap',
					minimum: 'manager',
				},
			}}
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.trap] }}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						inset={panel.inset}
						onMapReady={handleMapReady}
						searchWidth={panel.width}
						trapLayer={trapLayer}
					/>
					{selected === null ? null : (
						<TrapMapCard id={selected.id} inset={panel.inset} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				emptyTitle: 'No traps match',
				emptyDescription: 'Loosen the filters, or add a trap to start collecting.',
				renderRow: (trap) => (
					<TrapListItem
						isSelected={trap.id === selectedId}
						key={trap.id}
						methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
						onSelect={setSelectedId}
						trap={trap}
					/>
				),
			}}
		/>
	);
}

// --- filter controls --------------------------------------------------------

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'inactive', label: 'Inactive' },
];

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
