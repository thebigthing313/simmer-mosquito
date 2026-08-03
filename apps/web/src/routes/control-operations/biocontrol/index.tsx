import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { CheckIcon, MapPinnedIcon, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
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
import { type BiocontrolTileFilters, MapCanvas } from '../../../components/map';
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
import { BiocontrolMapCard } from '../-biocontrol-map-card';
import { ContextBadge, formatAmount, nameById, todayDateValue } from '../-control-display';
import { addDaysToDateString, useHabitatNames } from '../-overview-data';

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
const PAGE_SIZE = 50;

function BiocontrolExplorerRoute() {
	const today = useMemo(() => todayDateValue(), []);
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

	// A new filter set always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the filter set.
	useEffect(() => {
		setPage(0);
	}, [filters]);

	const { rows, total, isLoading } = useBiocontrolPage(filters, page);
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
	const fallbackSelected = useSelectedBiocontrol(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected release whenever the resolved selection changes.
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
						biocontrolLayer={biocontrolLayer}
						controls={{ layers: false }}
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
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Biocontrol</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<Button asChild size="sm">
								<Link to="/control-operations/biocontrol/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Record
								</Link>
							</Button>
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
						<HabitatToggle onChange={setHabitatOnly} value={habitatOnly} />
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
							{habitatOnly ? (
								<FilterChip label="Habitat-linked only" onRemove={() => setHabitatOnly(false)} />
							) : null}
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

// --- data hooks -------------------------------------------------------------

function useBiocontrolPage(
	filters: BiocontrolTileFilters,
	page: number,
): {
	readonly rows: readonly BiocontrolSite[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ['biocontrol', 'page', filters, page],
		queryFn: ({ signal }) => fetchBiocontrolPage(filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedBiocontrol(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, BiocontrolSite>,
): BiocontrolSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['biocontrol', 'detail', selectedId],
		queryFn: ({ signal }) => fetchBiocontrolById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchBiocontrolPage(
	filters: BiocontrolTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: BiocontrolSite[]; readonly total: number }> {
	const url = new URL('/map/biocontrol', getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.biocontrolMethodIds !== undefined && filters.biocontrolMethodIds.length > 0) {
		url.searchParams.set('biocontrolMethodId', filters.biocontrolMethodIds.join(','));
	}
	if (filters.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		url.searchParams.set('technician', filters.technicianProfileIds.join(','));
	}
	if (filters.regionIds !== undefined && filters.regionIds.length > 0) {
		url.searchParams.set('regionId', filters.regionIds.join(','));
	}
	if (filters.habitatLinkedOnly === true) {
		url.searchParams.set('habitatLinked', 'true');
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Biocontrol request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly biocontrolActions?: BiocontrolSite[];
		readonly total?: number;
	};
	return { rows: body.biocontrolActions ?? [], total: body.total ?? 0 };
}

async function fetchBiocontrolById(
	id: string,
	signal: AbortSignal,
): Promise<BiocontrolSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/biocontrol/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly biocontrolAction?: BiocontrolSite };
	return body.biocontrolAction ?? null;
}

// --- filter controls --------------------------------------------------------

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None' : total === 1 ? '1 release' : `${total} releases`}
		</span>
	);
}

function HabitatToggle({
	value,
	onChange,
}: {
	readonly value: boolean;
	readonly onChange: (next: boolean) => void;
}) {
	return (
		<button
			aria-pressed={value}
			className={cn(
				'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				value
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			onClick={() => onChange(!value)}
			type="button"
		>
			<span
				className={cn(
					'flex size-3.5 items-center justify-center rounded-[4px] border',
					value ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
				)}
			>
				{value ? <CheckIcon aria-hidden="true" className="size-2.5" /> : null}
			</span>
			Habitat-linked only
		</button>
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
				<p className="font-medium text-foreground text-sm">No releases in range</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Widen the time window or loosen the filters to bring biocontrol releases into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((row) => (
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
			))}
		</ul>
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

// --- helpers ----------------------------------------------------------------
