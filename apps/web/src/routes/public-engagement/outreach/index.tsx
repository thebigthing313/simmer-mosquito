import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	FilterGrid,
	MultiSelectFilter,
	mapQueryParams,
	toggle,
	useDateRangeFilters,
	useExplorerPanel,
	useFlyToSelection,
	useOutreachMethodOptions,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
	type OutreachTileFilters,
} from '../../../components/map';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { addDaysToDateString } from '../../control-operations/-overview-data';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { OutreachMapCard } from '../-outreach-map-card';
import { formatReach } from '../-public-engagement-display';

interface OutreachSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly outreachMethodId: string;
	readonly outreachDate: string;
	readonly reach: number;
	readonly reachDescription: string | null;
	readonly technicianProfileId: string | null;
	readonly inspectionId: string | null;
}

interface OutreachFilters {
	readonly from: string;
	readonly to: string;
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<OutreachFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

const OutreachEntityIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/')({
	component: OutreachExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const RESULT_NOUN = { one: 'action', many: 'actions' };
const PATH = '/map/outreach';

function OutreachExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults = useMemo<OutreachFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			people: new Set(),
			methods: new Set(),
			regions: new Set(),
		}),
		[defaultFrom, today],
	);
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(filterDefaults, FILTER_CODECS, DATE_RANGE_COUNTING);
	const dateFrom = query.from;
	const dateTo = query.to;
	const personIds = query.people;
	const methodIds = query.methods;
	const regionIds = query.regions;
	const setPersonIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ people: next }),
		[setFilters],
	);
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
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { options: methodOptions, nameById: methodNameById } = useOutreachMethodOptions();

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters = useMemo<OutreachTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { outreachMethodIds: [...methodIds] } : {}),
			...(personIds.size > 0 ? { technicianProfileIds: [...personIds] } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[methodIds, personIds, regionIds, dateFrom, dateTo],
	);
	const params = useMemo(
		() =>
			mapQueryParams({
				outreachMethodId: filters.outreachMethodIds,
				technician: filters.technicianProfileIds,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[filters],
	);

	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<OutreachSite>({
			path: PATH,
			rowsKey: 'outreachActions',
			label: 'Outreach',
			params,
		});

	const selected = useSelectedMapRecord<OutreachSite>({
		path: PATH,
		rowKey: 'outreachAction',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const layers = useMemo(
		(): readonly MapTileLayer[] => [
			{
				kind: 'outreach',
				serverUrl: getServerUrl(),
				filters,
				selectedId,
				onSelectFeature: setSelectedId,
			},
		],
		[filters, selectedId],
	);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter {...dateRange} />

					<FilterGrid>
						<MultiSelectFilter
							empty="No outreach methods"
							label="Method"
							onChange={setMethodIds}
							options={methodOptions}
							selected={methodIds}
						/>
						<MultiSelectFilter
							empty="No people"
							label="Technician"
							onChange={setPersonIds}
							options={personnel.options}
							selected={personIds}
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
						<ActiveFilterBar onClearAll={reset}>
							{[...methodIds].map((id) => (
								<FilterChip
									key={id}
									label={methodNameById.get(id) ?? 'Unknown method'}
									onRemove={() => setMethodIds(toggle(methodIds, id))}
								/>
							))}
							{[...personIds].map((id) => (
								<FilterChip
									key={`person-${id}`}
									label={personnel.nameById.get(id) ?? 'Unknown person'}
									onRemove={() => setPersonIds(toggle(personIds, id))}
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
					noun={{ one: 'action', many: 'actions' }}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Outreach',
				icon: OutreachEntityIcon,
				total,
				isLoading,
				noun: RESULT_NOUN,
				create: { to: '/public-engagement/outreach/create', label: 'Record Outreach' },
			}}
			onResetFilters={reset}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{
							create: [MAP_CREATE_TARGETS.outreach, MAP_CREATE_TARGETS.serviceRequest],
						}}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						layers={layers}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<OutreachMapCard
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
				emptyTitle: 'No outreach in range',
				emptyDescription:
					'Widen the time window or loosen the filters to bring outreach actions into range.',
				renderRow: (row) => (
					<OutreachListItem
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={methodNameById.get(row.outreachMethodId) ?? 'Unknown method'}
						onSelect={setSelectedId}
						row={row}
						technicianName={
							row.technicianProfileId === null
								? null
								: (personnel.nameById.get(row.technicianProfileId) ?? null)
						}
					/>
				),
			}}
		/>
	);
}

function OutreachListItem({
	row,
	methodName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: OutreachSite;
	readonly methodName: string;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const reach = `${formatReach(row.reach)} reached`;

	return (
		<ExplorerRow
			date={formatListDate(row.outreachDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/public-engagement/outreach/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={row.reachDescription === null ? reach : `${reach} · ${row.reachDescription}`}
			title={methodName}
			titleLink={{ to: '/public-engagement/outreach/$id', params: { id: row.id } }}
		/>
	);
}
