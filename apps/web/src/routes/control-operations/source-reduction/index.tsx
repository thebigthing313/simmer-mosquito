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
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
	useSourceReductionMethodOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	MAP_CREATE_TARGETS,
	MapCanvas,
	type SourceReductionTileFilters,
} from '../../../components/map';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import {
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { formatAmount } from '../-control-display';
import { addDaysToDateString } from '../-overview-data';
import { SourceReductionMapCard } from '../-source-reduction-map-card';

interface SourceReductionSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly sourceReductionMethodId: string;
	readonly sourceReductionDate: string;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

interface SourceReductionFilters {
	readonly from: string;
	readonly to: string;
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<SourceReductionFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

const SourceReductionEntityIcon = iconRegistry.entities.sourceReductionAction.icon;

export const Route = createFileRoute('/control-operations/source-reduction/')({
	component: SourceReductionExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const RESULT_NOUN = { one: 'source reduction', many: 'source reductions' };
const PATH = '/map/source-reduction';

function SourceReductionExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults = useMemo<SourceReductionFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			people: new Set(),
			methods: new Set(),
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

	const { options: methodOptions, nameById: methodNameById } = useSourceReductionMethodOptions();
	const unitById = useUnitLabels().byId;

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters = useMemo<SourceReductionTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { sourceReductionMethodIds: [...methodIds] } : {}),
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
				sourceReductionMethodId: filters.sourceReductionMethodIds,
				technician: filters.technicianProfileIds,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[filters],
	);

	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SourceReductionSite>({
			path: PATH,
			rowsKey: 'sourceReductions',
			label: 'Source reductions',
			params,
		});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatIds = useMemo(
		() => rows.flatMap((row) => (row.habitatId === null ? [] : [row.habitatId])),
		[rows],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const selected = useSelectedMapRecord<SourceReductionSite>({
		path: PATH,
		rowKey: 'sourceReduction',
		rows,
		selectedId,
	});
	useFlyToSelection(map, selected);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const sourceReductionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const activeFilterCount =
		(dateFrom === defaultFrom && dateTo === today ? 0 : 1) +
		methodIds.size +
		personIds.size +
		regionIds.size;
	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter {...dateRange} />

					<FilterGrid>
						<MultiSelectFilter
							empty="No source reduction methods"
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
						</ActiveFilterBar>
					) : null}
				</>
			}
			footer={
				<ExplorerPagination
					noun={{ one: 'source reduction', many: 'source reductions' }}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Source Reduction',
				icon: SourceReductionEntityIcon,
				total,
				isLoading,
				noun: RESULT_NOUN,
				create: {
					to: '/control-operations/source-reduction/create',
					label: 'Record Source Reduction',
				},
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.sourceReduction] }}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						onMapReady={handleMapReady}
						sourceReductionLayer={sourceReductionLayer}
					/>
					{selected === null ? null : (
						<SourceReductionMapCard
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
				emptyTitle: 'No source reduction in range',
				emptyDescription:
					'Widen the time window or loosen the filters to bring actions into range.',
				renderRow: (row) => (
					<SourceReductionListItem
						amountLabel={formatAmount(
							row.sourcesEliminatedAmount,
							unitById.get(row.sourcesEliminatedUnitId),
						)}
						habitatName={
							row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
						}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={methodNameById.get(row.sourceReductionMethodId) ?? 'Unknown method'}
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

function SourceReductionListItem({
	row,
	methodName,
	amountLabel,
	habitatName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: SourceReductionSite;
	readonly methodName: string;
	readonly amountLabel: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ExplorerRow
			date={formatListDate(row.sourceReductionDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/control-operations/source-reduction/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={`${amountLabel}${habitatName === null ? '' : ` · ${habitatName}`}`}
			title={methodName}
			titleLink={{ to: '/control-operations/source-reduction/$id', params: { id: row.id } }}
		/>
	);
}
