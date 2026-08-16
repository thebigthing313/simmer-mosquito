import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
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
import { type BiocontrolTileFilters, MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
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
import { BiocontrolMapCard } from '../-biocontrol-map-card';
import { ContextBadge, formatAmount, nameById } from '../-control-display';
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
	const { filters: query, setFilters, reset } = useSearchFilters(filterDefaults, FILTER_CODECS);
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
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.biocontrolMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const methodNameById = useMemo(() => nameById(methods, (method) => method.name), [methods]);
	const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

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

	const { rows, total, isLoading, page, pageCount, setPage } = usePagedMapResource<BiocontrolSite>({
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
	const biocontrolLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		dateFrom !== defaultFrom ||
		dateTo !== today ||
		methodIds.size > 0 ||
		habitatOnly ||
		regionIds.size > 0 ||
		personIds.size > 0;
	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.biocontrol] }}
						biocontrolLayer={biocontrolLayer}
						controls={{ layers: false, measure: true }}
						fitToData
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<BiocontrolMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<ExplorerHeader
					create={{ to: '/control-operations/biocontrol/create', label: 'Record' }}
					isLoading={isLoading}
					noun={RESULT_NOUN}
					title="Biocontrol"
					total={total}
				>
					<DateRangeFilter {...dateRange} />

					<div className="flex flex-wrap items-center gap-2">
						<MultiSelectFilter
							empty="No biocontrol methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
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
				</ExplorerHeader>

				<BiocontrolResults
					habitatNameById={habitatNameById}
					isLoading={isLoading}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					personnelNameById={personnel.nameById}
					rows={rows}
					selectedId={selectedId}
					unitById={unitById}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="releases"
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

function BiocontrolResults({
	rows,
	isLoading,
	selectedId,
	methodNameById,
	personnelNameById,
	habitatNameById,
	unitById,
	onSelect,
}: {
	readonly rows: readonly BiocontrolSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
	readonly habitatNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ResultList
			emptyDescription="Widen the time window or loosen the filters to bring biocontrol releases into range."
			emptyTitle="No releases in range"
			isLoading={isLoading}
			rows={rows}
		>
			{(row) => (
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
					onSelect={onSelect}
					row={row}
					technicianName={
						row.technicianProfileId === null
							? null
							: (personnelNameById.get(row.technicianProfileId) ?? null)
					}
				/>
			)}
		</ResultList>
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
