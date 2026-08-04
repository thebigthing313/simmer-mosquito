import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
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
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	toggle,
	usePersonnelOptions,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, type SourceReductionTileFilters } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
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
import { formatAmount, nameById, todayDateValue } from '../-control-display';
import { addDaysToDateString, useHabitatNames } from '../-overview-data';
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

export const Route = createFileRoute('/control-operations/source-reduction/')({
	component: SourceReductionExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const DEFAULT_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;

function SourceReductionExplorerRoute() {
	const today = useMemo(() => todayDateValue(), []);
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

	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const methodNameById = useMemo(() => nameById(methods, (method) => method.name), [methods]);
	const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

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

	// A new filter set always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the filter set.
	useEffect(() => {
		setPage(0);
	}, [filters]);

	const { rows, total, isLoading } = useSourceReductionsPage(filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	// Clamp if the row count shrinks under the current page (e.g. after a delete).
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatIds = useMemo(
		() => rows.flatMap((row) => (row.habitatId === null ? [] : [row.habitatId])),
		[rows],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedSourceReduction(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected action whenever the resolved selection changes.
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
	const sourceReductionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		dateFrom !== defaultFrom ||
		dateTo !== today ||
		methodIds.size > 0 ||
		personIds.size > 0 ||
		regionIds.size > 0;
	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						fitToData
						onMapReady={handleMapReady}
						sourceReductionLayer={sourceReductionLayer}
					/>
					{selected === null ? null : (
						<SourceReductionMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Source Reduction</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<WriteOnly>
								<Button asChild size="sm">
									<Link to="/control-operations/source-reduction/create">
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
							empty="No source reduction methods"
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
					</div>

					{hasActiveFilters ? (
						<div className="flex flex-wrap items-center gap-1.5">
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
							<button
								className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={clearAll}
								type="button"
							>
								Clear all
							</button>
						</div>
					) : null}
				</div>

				<SourceReductionResults
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
						noun="source reductions"
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

function useSourceReductionsPage(
	filters: SourceReductionTileFilters,
	page: number,
): {
	readonly rows: readonly SourceReductionSite[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ['source-reduction', 'page', filters, page],
		queryFn: ({ signal }) => fetchSourceReductionsPage(filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedSourceReduction(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, SourceReductionSite>,
): SourceReductionSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['source-reduction', 'detail', selectedId],
		queryFn: ({ signal }) => fetchSourceReductionById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchSourceReductionsPage(
	filters: SourceReductionTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: SourceReductionSite[]; readonly total: number }> {
	const url = new URL('/map/source-reduction', getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (
		filters.sourceReductionMethodIds !== undefined &&
		filters.sourceReductionMethodIds.length > 0
	) {
		url.searchParams.set('sourceReductionMethodId', filters.sourceReductionMethodIds.join(','));
	}
	if (filters.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		url.searchParams.set('technician', filters.technicianProfileIds.join(','));
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
		throw new Error(`Source reductions request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly sourceReductions?: SourceReductionSite[];
		readonly total?: number;
	};
	return { rows: body.sourceReductions ?? [], total: body.total ?? 0 };
}

async function fetchSourceReductionById(
	id: string,
	signal: AbortSignal,
): Promise<SourceReductionSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/source-reduction/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly sourceReduction?: SourceReductionSite };
	return body.sourceReduction ?? null;
}

// --- filter controls --------------------------------------------------------

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None' : total === 1 ? '1 source reduction' : `${total} source reductions`}
		</span>
	);
}

// --- results ----------------------------------------------------------------

function SourceReductionResults({
	rows,
	isLoading,
	selectedId,
	methodNameById,
	personnelNameById,
	habitatNameById,
	unitById,
	onSelect,
}: {
	readonly rows: readonly SourceReductionSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
	readonly habitatNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[60px]" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No source reduction in range</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Widen the time window or loosen the filters to bring actions into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((row) => (
				<SourceReductionListItem
					amountLabel={formatAmount(
						row.sourcesEliminatedAmount,
						unitById.get(row.sourcesEliminatedUnitId),
					)}
					habitatName={row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)}
					isSelected={row.id === selectedId}
					key={row.id}
					methodName={methodNameById.get(row.sourceReductionMethodId) ?? 'Unknown method'}
					onSelect={onSelect}
					row={row}
					technicianName={
						row.technicianProfileId === null
							? null
							: (personnelNameById.get(row.technicianProfileId) ?? null)
					}
				/>
			))}
		</ul>
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

// --- helpers ----------------------------------------------------------------
