import type { ControlMethodRow, UnitRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	MapPinnedIcon,
	PlusIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
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
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, type SourceReductionTileFilters } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { ContextBadge, formatAmount, nameById, todayDateValue } from '../-control-display';
import { addDaysToDateString, formatMonthDay, useHabitatNames } from '../-overview-data';
import { SourceReductionMapCard } from '../-source-reduction-map-card';

export const Route = createFileRoute('/control-operations/source-reduction/')({
	component: SourceReductionExplorerRoute,
});

interface SourceReductionSite {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly sourceReductionMethodId: string;
	readonly sourceReductionDate: string;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

const DEFAULT_WINDOW_DAYS = 90;
const PAGE_SIZE = 50;

function SourceReductionExplorerRoute() {
	const today = useMemo(() => todayDateValue(), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);
	const [dateFrom, setDateFrom] = useState(defaultFrom);
	const [dateTo, setDateTo] = useState(today);
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

	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const methodNameById = useMemo(() => nameById(methods, (method) => method.name), [methods]);
	const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const filters = useMemo<SourceReductionTileFilters>(
		() => ({
			...(methodIds.size > 0 ? { sourceReductionMethodIds: [...methodIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[methodIds, dateFrom, dateTo],
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

	const hasActiveFilters = dateFrom !== defaultFrom || dateTo !== today || methodIds.size > 0;
	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setMethodIds(new Set());
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
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
							<Button asChild size="sm">
								<Link to="/control-operations/source-reduction/create">
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
							empty="No source reduction methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
							selected={methodIds}
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

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

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

interface FilterOption {
	readonly id: string;
	readonly label: string;
}

function MultiSelectFilter({
	label,
	empty,
	options,
	selected,
	onChange,
}: {
	readonly label: string;
	readonly empty: string;
	readonly options: readonly FilterOption[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label={`Filter by ${label}`}
					className="h-8 justify-between font-normal"
					size="sm"
					variant="outline"
				>
					<span className="truncate">{label}</span>
					<span className="flex items-center gap-1">
						{count > 0 ? (
							<Badge className="px-1.5" variant="secondary">
								{count}
							</Badge>
						) : null}
						<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command>
					<CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
					<CommandList>
						<CommandEmpty>{empty}</CommandEmpty>
						<CommandGroup>
							{options.map((option) => {
								const isSelected = selected.has(option.id);
								return (
									<CommandItem
										key={option.id}
										onSelect={() => onChange(toggle(selected, option.id))}
										value={`${option.label} ${option.id}`}
									>
										<span
											className={cn(
												'flex size-4 items-center justify-center rounded-sm border',
												isSelected
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input',
											)}
										>
											{isSelected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
										</span>
										<span className="truncate">{option.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function FilterChip({
	label,
	onRemove,
}: {
	readonly label: string;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-foreground text-xs">
			{label}
			<button
				aria-label={`Remove ${label} filter`}
				className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}

// --- results ----------------------------------------------------------------

function SourceReductionResults({
	rows,
	isLoading,
	selectedId,
	methodNameById,
	habitatNameById,
	unitById,
	onSelect,
}: {
	readonly rows: readonly SourceReductionSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly habitatNameById: ReadonlyMap<string, string>;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{SKELETON_KEYS.map((key) => (
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
	isSelected,
	onSelect,
}: {
	readonly row: SourceReductionSite;
	readonly methodName: string;
	readonly amountLabel: string;
	readonly habitatName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<li className="relative">
			<button
				aria-label={`Show ${methodName} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(row.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
					{formatMonthDay(row.sourceReductionDate)}
				</span>
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: row.id }}
						to="/control-operations/source-reduction/$id"
					>
						{methodName}
					</Link>
					<span className="block truncate text-muted-foreground text-xs">
						{amountLabel}
						{habitatName === null ? '' : ` · ${habitatName}`}
					</span>
				</span>
				<ContextBadge habitatId={row.habitatId} inspectionId={row.inspectionId} />
				<Link
					aria-label={`View details for ${methodName}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: row.id }}
					title="View Source Reduction Details"
					to="/control-operations/source-reduction/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

// --- helpers ----------------------------------------------------------------

function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
	const next = new Set(set);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}
