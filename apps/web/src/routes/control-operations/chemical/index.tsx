import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
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
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { type ChemicalTileFilters, MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { formatListDate } from '../../larval-surveillance/-overview-data';
import { ApplicationMapCard } from '../-application-map-card';
import { formatAmount, nameById } from '../-control-display';
import { addDaysToDateString, todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/control-operations/chemical/')({
	component: ApplicationsExplorerRoute,
});

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

const DEFAULT_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;

function ApplicationsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	const [dateFrom, setDateFrom] = useState(defaultFrom);
	const [dateTo, setDateTo] = useState(today);
	const [insecticideIds, setInsecticideIds] = useState<ReadonlySet<string>>(() => new Set());
	const [personIds, setPersonIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [methodIds, setMethodIds] = useState<ReadonlySet<string>>(() => new Set());
	const [page, setPage] = useState(0);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Editing one bound past the other drags the other along, so the range never inverts.
	const handleFromChange = useCallback((next: string) => {
		setDateFrom(next);
		setDateTo((prev) => (next !== '' && prev !== '' && next > prev ? next : prev));
	}, []);
	const handleToChange = useCallback((next: string) => {
		setDateTo(next);
		setDateFrom((prev) => (next !== '' && prev !== '' && next < prev ? next : prev));
	}, []);
	const applyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setDateFrom(range.from);
			setDateTo(range.to);
		},
		[today],
	);
	const activePresetId = useMemo(
		() => activeDatePresetId(dateFrom, dateTo, today),
		[dateFrom, dateTo, today],
	);

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
	const filters = useMemo<ChemicalTileFilters>(
		() => ({
			...(insecticideIds.size > 0 ? { insecticideIds: [...insecticideIds] } : {}),
			...(methodIds.size > 0 ? { applicationMethodIds: [...methodIds] } : {}),
			...(personIds.size > 0 ? { applicatorProfileIds: [...personIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[insecticideIds, methodIds, personIds, dateFrom, dateTo],
	);

	// A new filter set always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the filter set.
	useEffect(() => {
		setPage(0);
	}, [filters]);

	const { rows, total, isLoading } = useApplicationsPage(filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	// Clamp if the row count shrinks under the current page (e.g. after a delete).
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedApplication(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected application whenever the resolved selection changes.
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
	const chemicalLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const hasActiveFilters =
		dateFrom !== defaultFrom ||
		dateTo !== today ||
		insecticideIds.size > 0 ||
		methodIds.size > 0 ||
		personIds.size > 0;
	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setInsecticideIds(new Set());
		setMethodIds(new Set());
		setPersonIds(new Set());
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						chemicalLayer={chemicalLayer}
						controls={{ layers: false }}
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
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Applications</h1>
						<div className="flex items-center gap-2.5">
							<ResultMeta isLoading={isLoading} total={total} />
							<Button asChild size="sm">
								<Link to="/control-operations/chemical/create">
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
					</div>

					{hasActiveFilters ? (
						<div className="flex flex-wrap items-center gap-1.5">
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
							<button
								className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={clearAll}
								type="button"
							>
								Clear All
							</button>
						</div>
					) : null}
				</div>

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

// --- data hooks -------------------------------------------------------------

function useApplicationsPage(
	filters: ChemicalTileFilters,
	page: number,
): {
	readonly rows: readonly ApplicationSite[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ['chemical', 'page', filters, page],
		queryFn: ({ signal }) => fetchApplicationsPage(filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedApplication(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, ApplicationSite>,
): ApplicationSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['chemical', 'detail', selectedId],
		queryFn: ({ signal }) => fetchApplicationById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchApplicationsPage(
	filters: ChemicalTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: ApplicationSite[]; readonly total: number }> {
	const url = new URL('/map/chemical', getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.insecticideIds !== undefined && filters.insecticideIds.length > 0) {
		url.searchParams.set('insecticideId', filters.insecticideIds.join(','));
	}
	if (filters.applicationMethodIds !== undefined && filters.applicationMethodIds.length > 0) {
		url.searchParams.set('applicationMethodId', filters.applicationMethodIds.join(','));
	}
	if (filters.applicatorProfileIds !== undefined && filters.applicatorProfileIds.length > 0) {
		url.searchParams.set('applicator', filters.applicatorProfileIds.join(','));
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Applications request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly applications?: ApplicationSite[];
		readonly total?: number;
	};
	return { rows: (body.applications ?? []).map(normalizeApplication), total: body.total ?? 0 };
}

async function fetchApplicationById(
	id: string,
	signal: AbortSignal,
): Promise<ApplicationSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/chemical/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly application?: ApplicationSite };
	return body.application === undefined ? null : normalizeApplication(body.application);
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

// --- filter controls --------------------------------------------------------

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None' : total === 1 ? '1 application' : `${total} applications`}
		</span>
	);
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
				<p className="font-medium text-foreground text-sm">No applications in range</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Widen the time window or loosen the filters to bring treatments into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((row) => (
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
			))}
		</ul>
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

// --- helpers ----------------------------------------------------------------
