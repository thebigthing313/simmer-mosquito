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
	ToggleFilter,
	toggle,
	useBiocontrolMethodOptions,
	useDateRangeFilters,
	useExplorerPanel,
	useFlyToSelection,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	type BiocontrolTileFilters,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
} from '../../../components/map';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { BiocontrolMapCard } from '../-biocontrol-map-card';
import { ContextBadge, formatAmount } from '../-control-display';
import { addDaysToDateString } from '../-overview-data';

interface BiocontrolSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly biocontrolMethodId: string;
	readonly biocontrolDate: string;
	readonly amountReleased: number;
	readonly releaseUnitId: string;
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

interface BiocontrolFilters {
	readonly from: string;
	readonly to: string;
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly habitat: boolean;
	readonly regions: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<BiocontrolFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	habitat: flagParam,
	regions: idSetParam,
};

const BiocontrolEntityIcon = iconRegistry.entities.biocontrolAction.icon;

export const Route = createFileRoute('/control-operations/biocontrol/')({
	component: BiocontrolExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const RESULT_NOUN = { one: 'release', many: 'releases' };
const PATH = '/map/biocontrol';

function BiocontrolExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults = useMemo<BiocontrolFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			people: new Set(),
			methods: new Set(),
			habitat: false,
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
	const habitatOnly = query.habitat;
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
	const setHabitatOnly = useCallback(
		(next: boolean) => setFilters({ habitat: next }),
		[setFilters],
	);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { options: methodOptions, nameById: methodNameById } = useBiocontrolMethodOptions();
	const unitById = useUnitLabels().byId;

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no toggle) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters = useMemo<BiocontrolTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { biocontrolMethodIds: [...methodIds] } : {}),
			...(personIds.size > 0 ? { technicianProfileIds: [...personIds] } : {}),
			...(habitatOnly ? { habitatLinkedOnly: true } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[methodIds, habitatOnly, personIds, regionIds, dateFrom, dateTo],
	);
	const params = useMemo(
		() =>
			mapQueryParams({
				biocontrolMethodId: filters.biocontrolMethodIds,
				technician: filters.technicianProfileIds,
				regionId: filters.regionIds,
				habitatLinked: filters.habitatLinkedOnly,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[filters],
	);

	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<BiocontrolSite>({
			path: PATH,
			rowsKey: 'biocontrolActions',
			label: 'Biocontrol',
			params,
		});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatIds = useMemo(
		() => rows.flatMap((row) => (row.habitatId === null ? [] : [row.habitatId])),
		[rows],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const selected = useSelectedMapRecord<BiocontrolSite>({
		path: PATH,
		rowKey: 'biocontrolAction',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const layers = useMemo(
		(): readonly MapTileLayer[] => [
			{
				kind: 'biocontrol',
				serverUrl: getServerUrl(),
				filters,
				selectedId,
				onSelectFeature: setSelectedId,
			},
		],
		[filters, selectedId],
	);

	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter {...dateRange} />

					<FilterGrid>
						<MultiSelectFilter
							empty="No biocontrol methods"
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
						<ToggleFilter
							label="Habitat-linked only"
							onChange={setHabitatOnly}
							value={habitatOnly}
						/>
					</FilterGrid>

					{activeFilterCount > 0 ? (
						<ActiveFilterBar onClearAll={clearAll}>
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
							{habitatOnly ? (
								<FilterChip label="Habitat-linked only" onRemove={() => setHabitatOnly(false)} />
							) : null}
						</ActiveFilterBar>
					) : null}
				</>
			}
			footer={
				<ExplorerPagination
					noun={{ one: 'release', many: 'releases' }}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Biocontrol',
				icon: BiocontrolEntityIcon,
				total,
				isLoading,
				noun: RESULT_NOUN,
				create: { to: '/control-operations/biocontrol/create', label: 'Record Release' },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.biocontrol] }}
						layers={layers}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<BiocontrolMapCard
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
				emptyTitle: 'No releases in range',
				emptyDescription:
					'Widen the time window or loosen the filters to bring biocontrol releases into range.',
				renderRow: (row) => (
					<BiocontrolListItem
						amount={formatAmount(row.amountReleased, unitById.get(row.releaseUnitId))}
						habitatName={
							row.habitatId === null
								? null
								: (habitatNameById.get(row.habitatId) ?? 'Unknown habitat')
						}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={methodNameById.get(row.biocontrolMethodId) ?? 'Unknown method'}
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

function BiocontrolListItem({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: BiocontrolSite;
	readonly methodName: string;
	readonly amount: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ExplorerRow
			badges={<ContextBadge habitatId={row.habitatId} inspectionId={row.inspectionId} />}
			date={formatListDate(row.biocontrolDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/control-operations/biocontrol/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={`${amount}${habitatName === null ? '' : ` · ${habitatName}`}`}
			title={methodName}
			titleLink={{ to: '/control-operations/biocontrol/$id', params: { id: row.id } }}
		/>
	);
}
