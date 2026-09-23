import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { collectionEffectiveDate } from '../../../components/adult-surveillance/adult-display';
import { CollectionMapCard } from '../../../components/adult-surveillance/collection-map-card';
import type { CollectionStatusValue } from '../../../components/adult-surveillance/collections/legend';
import {
	collectionLegend,
	collectionStatusLabel,
} from '../../../components/adult-surveillance/collections/legend';
import { createLabel } from '../../../components/app-shell/navigation';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	ToggleFilter,
	toggle,
	whenAny,
	whenOn,
	whenText,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	COLLECTION_STATUS_COLORS,
	type CollectionTileFilters,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
} from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useRegionOptions } from '../../../hooks/explorer/use-region-options';
import { collectionLabel } from '../../../hooks/queries/trap-view';
import { useTrapNames } from '../../../hooks/queries/use-trap-names';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { addDaysToDateString, formatListDate, todayInTimeZone } from '../../../lib/local-date';
import { type RecordType, recordNoun } from '../../../lib/record-nouns';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	searchValidator,
} from '../../../lib/search-filters';

interface CollectionRow {
	readonly id: string;
	readonly trapId: string | null;
	/** The Address it was linked to: the rung below the trap name. */
	readonly addressDisplayName: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	/** Resolved server-side by precedence, and what the map paints this by. */
	readonly status: CollectionStatusValue;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
}

interface CollectionFilters {
	readonly from: string;
	readonly to: string;
	readonly methods: ReadonlySet<string>;
	readonly problems: boolean;
	/** Awaiting identification: dated, not a zero result, no species keyed out. */
	readonly awaiting: boolean;
	readonly regions: ReadonlySet<string>;
}

const COLLECTION_FILTER_CODECS: FilterCodecs<CollectionFilters> = {
	from: dateParam,
	to: dateParam,
	methods: idSetParam,
	problems: flagParam,
	awaiting: flagParam,
	regions: idSetParam,
};

const CollectionEntityIcon = iconRegistry.entities.collection.icon;

export const Route = createFileRoute('/adult-surveillance/collections/')({
	component: CollectionsExplorerRoute,
	validateSearch: searchValidator(COLLECTION_FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const RECORD_TYPE: RecordType = 'collection';
const PATH = '/map/collections';

function CollectionsExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaultFrom = addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1));
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults: CollectionFilters = {
		from: defaultFrom,
		to: today,
		methods: new Set(),
		problems: false,
		awaiting: false,
		regions: new Set(),
	};
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(filterDefaults, COLLECTION_FILTER_CODECS, DATE_RANGE_COUNTING);
	const dateFrom = query.from;
	const dateTo = query.to;
	const methodIds = query.methods;
	const problemOnly = query.problems;
	const awaitingOnly = query.awaiting;
	const regionIds = query.regions;
	const setMethodIds = (next: ReadonlySet<string>) => setFilters({ methods: next });
	const setProblemOnly = (next: boolean) => setFilters({ problems: next });
	const setAwaitingOnly = (next: boolean) => setFilters({ awaiting: next });
	const setRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { options: methodOptions, nameById: methodNameById } = useCollectionMethodOptions();
	const trapNameById = useTrapNames();

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters: CollectionTileFilters = {
		...whenAny('collectionMethodIds', methodIds),
		...whenOn('problemOnly', problemOnly),
		...whenOn('awaitingOnly', awaitingOnly),
		...whenAny('regionIds', regionIds),
		...whenText('dateFrom', dateFrom),
		...whenText('dateTo', dateTo),
	};
	const legend = collectionLegend(problemOnly);
	const layer: MapTileLayer = {
		kind: 'collections',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const layers: readonly MapTileLayer[] = [layer];
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage, selected, empty } =
		useExplorerResource<CollectionRow>({
			path: PATH,
			rowsKey: 'collections',
			rowKey: 'collection',
			recordType: 'collection',
			params: {
				collectionMethodId: filters.collectionMethodIds,
				problem: filters.problemOnly,
				awaiting: filters.awaitingOnly,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			},
			layer,
			map,
			selectedId,
		});

	const handleMapReady = (instance: MapboxMap) => setMap(instance);

	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter {...dateRange} />

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
						<ToggleFilter label="Problems only" onChange={setProblemOnly} value={problemOnly} />
						<ToggleFilter
							label="Awaiting identification"
							onChange={setAwaitingOnly}
							value={awaitingOnly}
						/>
					</FilterGrid>

					{activeFilterCount > 0 ? (
						<CollectionChips
							awaitingOnly={awaitingOnly}
							methodIds={methodIds}
							methodNameById={methodNameById}
							onClearAll={clearAll}
							problemOnly={problemOnly}
							regionIds={regionIds}
							regionNameById={regions.nameById}
							setAwaitingOnly={setAwaitingOnly}
							setMethodIds={setMethodIds}
							setProblemOnly={setProblemOnly}
							setRegionIds={setRegionIds}
						/>
					) : null}
				</>
			}
			footer={
				<ExplorerPagination
					noun={recordNoun(RECORD_TYPE)}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: recordNoun('collection').titleMany,
				icon: CollectionEntityIcon,
				total,
				isLoading,
				create: { to: '/adult-surveillance/collections/create', label: createLabel('collection') },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.collection, MAP_CREATE_TARGETS.trap] }}
						layers={layers}
						controls={{ measure: true, readout: true }}
						fitToData
						legend={legend}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<CollectionMapCard
							id={selected.id}
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
				empty,
				renderRow: (row) => (
					<CollectionListItem
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
						onSelect={setSelectedId}
						row={row}
						setByName={collectionPersonnelName(row, personnel.nameById)}
						trapName={row.trapId === null ? null : (trapNameById.get(row.trapId) ?? 'Unknown trap')}
					/>
				),
			}}
		/>
	);
}

/** What is currently narrowing the list, each chip removing its own filter. */
function CollectionChips({
	methodIds,
	regionIds,
	problemOnly,
	awaitingOnly,
	methodNameById,
	regionNameById,
	setMethodIds,
	setRegionIds,
	setProblemOnly,
	setAwaitingOnly,
	onClearAll,
}: {
	readonly methodIds: ReadonlySet<string>;
	readonly regionIds: ReadonlySet<string>;
	readonly problemOnly: boolean;
	readonly awaitingOnly: boolean;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly setMethodIds: (next: ReadonlySet<string>) => void;
	readonly setRegionIds: (next: ReadonlySet<string>) => void;
	readonly setProblemOnly: (next: boolean) => void;
	readonly setAwaitingOnly: (next: boolean) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
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
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => setRegionIds(toggle(regionIds, id))}
				/>
			))}
			{problemOnly ? (
				<FilterChip label="Problems only" onRemove={() => setProblemOnly(false)} />
			) : null}
			{awaitingOnly ? (
				<FilterChip label="Awaiting identification" onRemove={() => setAwaitingOnly(false)} />
			) : null}
		</ActiveFilterBar>
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
	readonly row: CollectionRow;
	readonly trapName: string | null;
	readonly methodName: string;
	readonly setByName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	/*
	 * `trapName` is resolved from the trap name map above rather than off the
	 * row, so the trap rung is already taken by the time this runs and the row's
	 * own name columns are not on this surface. What is left is the ladder below
	 * it: the address, then the coordinates, then the word (#1231).
	 */
	const label =
		trapName ??
		collectionLabel(
			{ trapId: null, trapName: null, trapCode: null, lat: row.lat, lng: row.lng },
			{ addressName: row.addressDisplayName, fallback: 'One-off collection' },
		);
	const timeZone = useOrganizationTimeZone();
	const effectiveDate = collectionEffectiveDate(row, timeZone);
	/*
	 * Bycatch only. Trap out, Problem reported and Zero result are the
	 * collection's status, which the dot at the left of the row draws in the
	 * colour the map paints it and the key names. A collection with no bycatch
	 * passes nothing, so the row lays out no line for it.
	 */
	const facts: RecordBadgeFacts = {
		category: 'collection',
		status: row.status,
		hasBycatch: row.hasBycatch,
	};
	return (
		<ExplorerRow
			badges={recordBadges(facts, 'dot')}
			date={effectiveDate === null ? null : formatListDate(effectiveDate)}
			detailLabel={`View details for ${label}`}
			detailLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={setByName}
			selectLabel={`Show ${label} on the map`}
			subtitle={methodName}
			swatch={collectionSwatch(row.status)}
			title={label}
			titleLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
		/>
	);
}

/** The status colour this collection draws in, so the row matches the map. */
function collectionSwatch(status: CollectionStatusValue): {
	readonly color: string;
	readonly label: string;
} {
	return {
		color: COLLECTION_STATUS_COLORS[status] ?? COLLECTION_STATUS_COLORS.collected ?? '',
		label: collectionStatusLabel(status),
	};
}

/** Who handled this collection: whoever collected it, else whoever set it. */
function collectionPersonnelName(
	row: CollectionRow,
	nameById: ReadonlyMap<string, string>,
): string | null {
	const profileId = row.collectedByProfileId ?? row.setByProfileId;
	return profileId === null ? null : (nameById.get(profileId) ?? null);
}
