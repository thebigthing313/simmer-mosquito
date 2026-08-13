import type { CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerHeader,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	mapQueryParams,
	ResultList,
	ToggleFilter,
	toggle,
	useDateRangeFilters,
	useFlyToSelection,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type CollectionTileFilters, MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
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
const RESULT_NOUN = { one: 'collection', many: 'collections' };
const PATH = '/map/collections';

function CollectionsExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
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
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

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
	const params = useMemo(
		() =>
			mapQueryParams({
				collectionMethodId: filters.collectionMethodIds,
				problem: filters.problemOnly,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[filters],
	);

	const { rows, total, isLoading, page, pageCount, setPage } = usePagedMapResource<CollectionSite>({
		path: PATH,
		rowsKey: 'collections',
		label: 'Collections',
		params,
	});

	const selected = useSelectedMapRecord<CollectionSite>({
		path: PATH,
		rowKey: 'collection',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

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
						contextMenu={{ create: [MAP_CREATE_TARGETS.collection, MAP_CREATE_TARGETS.trap] }}
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
				<ExplorerHeader
					create={{ to: '/adult-surveillance/collections/create', label: 'Record' }}
					isLoading={isLoading}
					noun={RESULT_NOUN}
					title="Collections"
					total={total}
				>
					<DateRangeFilter {...dateRange} />

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
				</ExplorerHeader>

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
	const timeZone = useOrganizationTimeZone();
	const effectiveDate = collectionEffectiveDate(row, timeZone);
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
