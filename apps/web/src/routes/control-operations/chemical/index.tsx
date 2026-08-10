import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
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
	toggle,
	useDateRangeFilters,
	useFlyToSelection,
	usePagedMapResource,
	usePersonnelOptions,
	useRegionOptions,
	useSelectedMapRecord,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type ChemicalTileFilters, MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import {
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { ApplicationMapCard } from '../-application-map-card';
import { formatAmount, nameById } from '../-control-display';
import { addDaysToDateString, todayInTimeZone } from '../-overview-data';

interface ApplicationSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly applicationDate: string;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly habitatId: string | null;
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	readonly batchNames: string[];
}

interface ApplicationFilters {
	readonly from: string;
	readonly to: string;
	readonly insecticides: ReadonlySet<string>;
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<ApplicationFilters> = {
	from: dateParam,
	to: dateParam,
	insecticides: idSetParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/control-operations/chemical/')({
	component: ApplicationsExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const RESULT_NOUN = { one: 'application', many: 'applications' };
const PATH = '/map/chemical';

function ApplicationsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const filterDefaults = useMemo<ApplicationFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			insecticides: new Set(),
			people: new Set(),
			methods: new Set(),
			regions: new Set(),
		}),
		[defaultFrom, today],
	);
	const { filters: query, setFilters, reset } = useSearchFilters(filterDefaults, FILTER_CODECS);
	const dateFrom = query.from;
	const dateTo = query.to;
	const insecticideIds = query.insecticides;
	const personIds = query.people;
	const methodIds = query.methods;
	const regionIds = query.regions;
	const setInsecticideIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ insecticides: next }),
		[setFilters],
	);
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
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	// Order + project the product options straight from the collection so the
	// alphabetized select and the id→name lookup share one live read, rather than
	// copying the collection into a memoized array.
	const { data: productOptions } = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ insecticide: webCollections.insecticides })
				.orderBy(({ insecticide }) => insecticide.tradeName, 'asc')
				.select(({ insecticide }) => ({ id: insecticide.id, label: insecticide.tradeName })),
		[],
	);
	const insecticideNameById = useMemo(
		() => nameById(productOptions, (option) => option.label),
		[productOptions],
	);
	const methodNameById = useMemo(() => nameById(methods, (method) => method.name), [methods]);
	const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const personnel = usePersonnelOptions();
	const regions = useRegionOptions();
	const filters = useMemo<ChemicalTileFilters>(
		() => ({
			...(insecticideIds.size > 0 ? { insecticideIds: [...insecticideIds] } : {}),
			...(methodIds.size > 0 ? { applicationMethodIds: [...methodIds] } : {}),
			...(personIds.size > 0 ? { applicatorProfileIds: [...personIds] } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[insecticideIds, methodIds, personIds, regionIds, dateFrom, dateTo],
	);
	const params = useMemo(
		() =>
			mapQueryParams({
				insecticideId: filters.insecticideIds,
				applicationMethodId: filters.applicationMethodIds,
				applicator: filters.applicatorProfileIds,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[filters],
	);

	const { rows, total, isLoading, page, pageCount, setPage } = usePagedMapResource<ApplicationSite>(
		{
			path: PATH,
			rowsKey: 'applications',
			label: 'Applications',
			params,
			normalizeRow: normalizeApplication,
		},
	);

	const selected = useSelectedMapRecord<ApplicationSite>({
		path: PATH,
		rowKey: 'application',
		rows,
		selectedId,
		normalizeRow: normalizeApplication,
	});
	useFlyToSelection(map, selected);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const chemicalLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		dateFrom !== defaultFrom ||
		dateTo !== today ||
		insecticideIds.size > 0 ||
		methodIds.size > 0 ||
		personIds.size > 0 ||
		regionIds.size > 0;
	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.chemical] }}
						chemicalLayer={chemicalLayer}
						controls={{ layers: false, measure: true }}
						fitToData
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<ApplicationMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<ExplorerHeader
					create={{ to: '/control-operations/chemical/create', label: 'Record' }}
					isLoading={isLoading}
					noun={RESULT_NOUN}
					title="Applications"
					total={total}
				>
					<DateRangeFilter {...dateRange} />

					<div className="grid grid-cols-2 gap-2">
						<MultiSelectFilter
							empty="No insecticides"
							label="Product"
							onChange={setInsecticideIds}
							options={productOptions}
							selected={insecticideIds}
						/>
						<MultiSelectFilter
							empty="No application methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
							selected={methodIds}
						/>
						<MultiSelectFilter
							empty="No people"
							label="Applicator"
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
					</div>

					{hasActiveFilters ? (
						<ActiveFilterBar onClearAll={clearAll}>
							{[...insecticideIds].map((id) => (
								<FilterChip
									key={id}
									label={insecticideNameById.get(id) ?? 'Unknown product'}
									onRemove={() => setInsecticideIds(toggle(insecticideIds, id))}
								/>
							))}
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
				</ExplorerHeader>

				<ApplicationResults
					insecticideNameById={insecticideNameById}
					isLoading={isLoading}
					methodNameById={methodNameById}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
					unitById={unitById}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="applications"
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

// The applicator + batch fields are newer than some deployed servers; default
// them so a row that predates them can never crash the list/card render.
function normalizeApplication(row: ApplicationSite): ApplicationSite {
	return {
		...row,
		applicatorName: row.applicatorName ?? null,
		batchNames: row.batchNames ?? [],
	};
}

// --- results ----------------------------------------------------------------

function ApplicationResults({
	rows,
	isLoading,
	selectedId,
	insecticideNameById,
	methodNameById,
	unitById,
	onSelect,
}: {
	readonly rows: readonly ApplicationSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly insecticideNameById: ReadonlyMap<string, string>;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ResultList
			emptyDescription="Widen the time window or loosen the filters to bring treatments into range."
			emptyTitle="No applications in range"
			isLoading={isLoading}
			rows={rows}
		>
			{(row) => (
				<ApplicationListItem
					amount={formatAmount(row.amountApplied, unitById.get(row.applicationUnitId))}
					isSelected={row.id === selectedId}
					key={row.id}
					methodName={
						row.applicationMethodId === null
							? null
							: (methodNameById.get(row.applicationMethodId) ?? 'Unknown method')
					}
					onSelect={onSelect}
					productName={insecticideNameById.get(row.insecticideId) ?? 'Unknown product'}
					row={row}
				/>
			)}
		</ResultList>
	);
}

function ApplicationListItem({
	row,
	productName,
	methodName,
	amount,
	isSelected,
	onSelect,
}: {
	readonly row: ApplicationSite;
	readonly productName: string;
	readonly methodName: string | null;
	readonly amount: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const batches = row.batchNames.length > 0 ? `Batch ${row.batchNames.join(', ')}` : null;
	return (
		<ExplorerRow
			date={formatListDate(row.applicationDate)}
			detailLabel={`View details for ${productName}`}
			detailLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={[row.applicatorName, batches].filter(Boolean).join(' · ') || null}
			selectLabel={`Show ${productName} on the map`}
			subtitle={`${amount}${methodName === null ? '' : ` · ${methodName}`}`}
			title={productName}
			titleLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
		/>
	);
}
