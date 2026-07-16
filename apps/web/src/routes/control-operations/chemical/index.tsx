import type { ControlMethodRow, InsecticideRow, UnitRow } from '@simmer-mosquito/sync';
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
import { type ChemicalTileFilters, MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { formatActionDate, formatAmount, nameById } from '../-control-display';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from '../-overview-data';
import { insecticideLabel } from './-application-form';

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

	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);

	const insecticideNameById = useMemo(
		() => nameById(insecticides, insecticideLabel),
		[insecticides],
	);
	const methodNameById = useMemo(() => nameById(methods, (method) => method.name), [methods]);
	const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const filters = useMemo<ChemicalTileFilters>(
		() => ({
			...(insecticideIds.size > 0 ? { insecticideIds: [...insecticideIds] } : {}),
			...(methodIds.size > 0 ? { applicationMethodIds: [...methodIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[insecticideIds, methodIds, dateFrom, dateTo],
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
		dateFrom !== defaultFrom || dateTo !== today || insecticideIds.size > 0 || methodIds.size > 0;
	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setInsecticideIds(new Set());
		setMethodIds(new Set());
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						chemicalLayer={chemicalLayer}
						controls={{ layers: false }}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<ApplicationDetailCard
							amount={formatAmount(
								selected.amountApplied,
								unitById.get(selected.applicationUnitId),
							)}
							methodName={
								selected.applicationMethodId === null
									? null
									: (methodNameById.get(selected.applicationMethodId) ?? 'Unknown method')
							}
							onClose={() => setSelectedId(null)}
							productName={insecticideNameById.get(selected.insecticideId) ?? 'Unknown product'}
							row={selected}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
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

					<div className="flex flex-wrap items-center gap-2">
						<MultiSelectFilter
							empty="No insecticides"
							label="Product"
							onChange={setInsecticideIds}
							options={insecticides.map((row) => ({ id: row.id, label: insecticideLabel(row) }))}
							selected={insecticideIds}
						/>
						<MultiSelectFilter
							empty="No application methods"
							label="Method"
							onChange={setMethodIds}
							options={methods.map((method) => ({ id: method.id, label: method.name }))}
							selected={methodIds}
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
	return { rows: body.applications ?? [], total: body.total ?? 0 };
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
	return body.application ?? null;
}

// --- filter controls --------------------------------------------------------

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

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
				{SKELETON_KEYS.map((key) => (
					<div className="h-[60px] animate-pulse rounded-md bg-muted/60" key={key} />
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
	return (
		<li className="relative">
			<button
				aria-label={`Show ${productName} on the map`}
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
					{formatMonthDay(row.applicationDate)}
				</span>
				<span className="min-w-0 flex-1">
					<Link
						className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						params={{ id: row.id }}
						to="/control-operations/chemical/$id"
					>
						{productName}
					</Link>
					<span className="block truncate text-muted-foreground text-xs">
						{amount}
						{methodName === null ? '' : ` · ${methodName}`}
					</span>
				</span>
				<Link
					aria-label={`View details for ${productName}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: row.id }}
					title="View application details"
					to="/control-operations/chemical/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function ApplicationDetailCard({
	row,
	productName,
	methodName,
	amount,
	onClose,
}: {
	readonly row: ApplicationSite;
	readonly productName: string;
	readonly methodName: string | null;
	readonly amount: string;
	readonly onClose: () => void;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[460px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="grid min-w-0 gap-0.5">
						<h2 className="font-semibold text-base text-foreground leading-tight">
							<Link
								className="block w-fit max-w-full truncate rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								params={{ id: row.id }}
								to="/control-operations/chemical/$id"
							>
								{productName}
							</Link>
						</h2>
						<p className="truncate text-muted-foreground text-sm">
							{amount} · {formatActionDate(row.applicationDate)}
						</p>
					</div>
					<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
						<XIcon aria-hidden="true" />
					</Button>
				</div>

				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<DetailFact label="Method" value={methodName ?? 'No method'} />
					<DetailFact label="Coordinates" value={coordinateLabel(row)} />
				</dl>

				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: row.id }} to="/control-operations/chemical/$id">
							View full details
							<ChevronRightIcon aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</article>
		</div>
	);
}

function DetailFact({
	label,
	value,
	wide = false,
}: {
	readonly label: string;
	readonly value: string;
	readonly wide?: boolean;
}) {
	return (
		<div
			className={cn(
				'grid gap-0.5 rounded-md border border-border/40 bg-background/60 px-2.5 py-1.5',
				wide && 'col-span-2',
			)}
		>
			<dt className="font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wide">
				{label}
			</dt>
			<dd className="truncate font-medium text-foreground">{value}</dd>
		</div>
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

function coordinateLabel(point: { readonly lat: number; readonly lng: number }): string {
	return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}
