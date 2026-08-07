import type { CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	ResultList,
	ToggleFilter,
	toggle,
	usePersonnelOptions,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type CollectionTileFilters, MapCanvas } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import {
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { CollectionFlagBadges, collectionEffectiveDate, trapDisplayName } from '../-adult-display';
import { CollectionMapCard } from '../-collection-map-card';
import { addDaysToDateString, todayInTimeZone } from '../-overview-data';

interface CollectionSite {
	readonly id: string;
	readonly trapId: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
}

interface CollectionFilters {
	readonly from: string;
	readonly to: string;
	readonly methods: ReadonlySet<string>;
	readonly problems: boolean;
	readonly regions: ReadonlySet<string>;
}

const COLLECTION_FILTER_CODECS: FilterCodecs<CollectionFilters> = {
	from: dateParam,
	to: dateParam,
	methods: idSetParam,
	problems: flagParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/adult-surveillance/collections/')({
	component: CollectionsExplorerRoute,
	validateSearch: searchValidator(COLLECTION_FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;

function CollectionsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults = useMemo<CollectionFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			methods: new Set(),
			problems: false,
			regions: new Set(),
		}),
		[defaultFrom, today],
	);
	const {
		filters: query,
		setFilters,
		reset,
	} = useSearchFilters(filterDefaults, COLLECTION_FILTER_CODECS);
	const dateFrom = query.from;
	const dateTo = query.to;
	const methodIds = query.methods;
	const problemOnly = query.problems;
	const regionIds = query.regions;
	const setMethodIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ methods: next }),
		[setFilters],
	);
	const setProblemOnly = useCallback(
		(next: boolean) => setFilters({ problems: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const [page, setPage] = useState(0);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Editing one bound past the other drags the other along, so the range never inverts.
	const handleFromChange = useCallback(
		(next: string) => {
			setFilters({
				from: next,
				...(next !== '' && dateTo !== '' && next > dateTo ? { to: next } : {}),
			});
		},
		[setFilters, dateTo],
	);
	const handleToChange = useCallback(
		(next: string) => {
			setFilters({
				to: next,
				...(next !== '' && dateFrom !== '' && next < dateFrom ? { from: next } : {}),
			});
		},
		[setFilters, dateFrom],
	);
	const applyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setFilters({ from: range.from, to: range.to });
		},
		[setFilters, today],
	);
	const activePresetId = useMemo(
		() => activeDatePresetId(dateFrom, dateTo, today),
		[dateFrom, dateTo, today],
	);

	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);

	const trapById = useMemo(() => new Map(traps.map((trap) => [trap.id, trap])), [traps]);
	const methodNameById = useMemo(
		() => new Map(methods.map((method) => [method.id, method.name])),
		[methods],
	);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters = useMemo<CollectionTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { collectionMethodIds: [...methodIds] } : {}),
			...(problemOnly ? { problemOnly: true } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[methodIds, problemOnly, regionIds, dateFrom, dateTo],
	);

	// A new filter set always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the filter set.
	useEffect(() => {
		setPage(0);
	}, [filters]);

	const { rows, total, isLoading } = useCollectionsPage(filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	// Clamp if the row count shrinks under the current page (e.g. after a delete).
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedCollection(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected collection whenever the resolved selection changes.
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
	const collectionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		dateFrom !== defaultFrom ||
		dateTo !== today ||
		methodIds.size > 0 ||
		problemOnly ||
		regionIds.size > 0;
	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						collectionLayer={collectionLayer}
						controls={{ layers: false, measure: true }}
						fitToData
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<CollectionMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Collections</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<WriteOnly>
								<Button asChild size="sm">
									<Link to="/adult-surveillance/collections/create">
										<PlusIcon aria-hidden="true" data-icon="inline-start" />
										Record
									</Link>
								</Button>
							</WriteOnly>
						</div>
					</div>

					<DateRangeFilter
						activePresetId={activePresetId}
						from={dateFrom}
						onApplyPreset={applyPreset}
						onFromChange={handleFromChange}
						onToChange={handleToChange}
						to={dateTo}
						today={today}
					/>

					<div className="flex flex-wrap items-center gap-2">
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
						<ToggleFilter label="Problems only" onChange={setProblemOnly} value={problemOnly} />
					</div>

					{hasActiveFilters ? (
						<ActiveFilterBar onClearAll={clearAll}>
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
							{problemOnly ? (
								<FilterChip label="Problems only" onRemove={() => setProblemOnly(false)} />
							) : null}
						</ActiveFilterBar>
					) : null}
				</div>

				<CollectionResults
					isLoading={isLoading}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					personnelNameById={personnel.nameById}
					rows={rows}
					selectedId={selectedId}
					trapById={trapById}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="collections"
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

function useCollectionsPage(
	filters: CollectionTileFilters,
	page: number,
): {
	readonly rows: readonly CollectionSite[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ['collections', 'page', filters, page],
		queryFn: ({ signal }) => fetchCollectionsPage(filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedCollection(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, CollectionSite>,
): CollectionSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['collections', 'detail', selectedId],
		queryFn: ({ signal }) => fetchCollectionById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchCollectionsPage(
	filters: CollectionTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: CollectionSite[]; readonly total: number }> {
	const url = new URL('/map/collections', getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		url.searchParams.set('collectionMethodId', filters.collectionMethodIds.join(','));
	}
	if (filters.problemOnly === true) {
		url.searchParams.set('problem', 'true');
	}
	if (filters.regionIds !== undefined && filters.regionIds.length > 0) {
		url.searchParams.set('regionId', filters.regionIds.join(','));
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Collections request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly collections?: CollectionSite[];
		readonly total?: number;
	};
	return { rows: body.collections ?? [], total: body.total ?? 0 };
}

async function fetchCollectionById(
	id: string,
	signal: AbortSignal,
): Promise<CollectionSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/collections/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly collection?: CollectionSite };
	return body.collection ?? null;
}

// --- filter controls --------------------------------------------------------

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None' : total === 1 ? '1 collection' : `${total} collections`}
		</span>
	);
}

// --- results ----------------------------------------------------------------

function CollectionResults({
	rows,
	isLoading,
	selectedId,
	trapById,
	methodNameById,
	personnelNameById,
	onSelect,
}: {
	readonly rows: readonly CollectionSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly trapById: ReadonlyMap<string, TrapRow>;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ResultList
			emptyDescription="Widen the time window or loosen the filters to bring collections into range."
			emptyTitle="No collections in range"
			isLoading={isLoading}
			rows={rows}
		>
			{(row) => (
				<CollectionListItem
					isSelected={row.id === selectedId}
					key={row.id}
					methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					row={row}
					setByName={collectionPersonnelName(row, personnelNameById)}
					trapName={
						row.trapId === null ? null : (trapNameFor(row.trapId, trapById) ?? 'Unknown trap')
					}
				/>
			)}
		</ResultList>
	);
}

function CollectionListItem({
	row,
	trapName,
	methodName,
	setByName,
	isSelected,
	onSelect,
}: {
	readonly row: CollectionSite;
	readonly trapName: string | null;
	readonly methodName: string;
	readonly setByName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const label = trapName ?? 'Ad-hoc collection';
	const effectiveDate = collectionEffectiveDate(row);
	return (
		<ExplorerRow
			badges={
				<CollectionFlagBadges className="flex shrink-0 items-center gap-1.5" collection={row} />
			}
			date={effectiveDate === null ? null : formatListDate(effectiveDate)}
			detailLabel={`View details for ${label}`}
			detailLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={setByName}
			selectLabel={`Show ${label} on the map`}
			subtitle={methodName}
			title={label}
			titleLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
		/>
	);
}

/** Who handled this collection: whoever collected it, else whoever set it. */
function collectionPersonnelName(
	row: CollectionSite,
	nameById: ReadonlyMap<string, string>,
): string | null {
	const profileId = row.collectedByProfileId ?? row.setByProfileId;
	return profileId === null ? null : (nameById.get(profileId) ?? null);
}

// --- helpers ----------------------------------------------------------------

function trapNameFor(trapId: string, trapById: ReadonlyMap<string, TrapRow>): string | null {
	const trap = trapById.get(trapId);
	return trap === undefined ? null : trapDisplayName(trap);
}
