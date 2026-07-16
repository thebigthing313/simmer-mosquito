import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { OrganizationSpeciesRow, SpeciesRow } from '@simmer-mosquito/sync';
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
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import {
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	iconRegistry,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, SAMPLE_STATUS_COLORS, type SampleTileFilters } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from '../-overview-data';
import { samplesSearchSchema } from '../-samples-search';

const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

export const Route = createFileRoute('/larval-surveillance/samples/')({
	component: SamplesExplorerRoute,
	validateSearch: (search) => samplesSearchSchema.parse(search),
});

/** One identified species within a sample, as returned by `/map/samples`. */
interface SampleSpeciesResult {
	readonly speciesId: string;
	readonly larvaeCount: number;
}

// A sample's resolved lifecycle state. The server commits to one status by
// precedence (an identified result wins over any closed-out reason), so the map
// color and the list badge always agree.
type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

/**
 * One sample as returned by `/map/samples` — the parent inspection's owned-geometry
 * projection plus the sample's result fields, its habitat label, and its identified
 * species rolled up with counts.
 */
interface SampleFeature {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	readonly displayName: string | null;
	readonly inspectionId: string;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly status: SampleStatus;
	readonly identifiedAt: string | null;
	readonly larvaeTotal: number;
	readonly results: readonly SampleSpeciesResult[];
}

type StatusFilterValue = 'all' | SampleStatus;

interface StatusMeta {
	readonly label: string;
	readonly tone: 'success' | 'info' | 'neutral' | 'warning';
}

const STATUS_META: Record<SampleStatus, StatusMeta> = {
	identified: { label: 'Identified', tone: 'success' },
	awaiting: { label: 'Awaiting ID', tone: 'info' },
	zero_larvae: { label: 'No larvae', tone: 'neutral' },
	unidentifiable: { label: 'Unidentifiable', tone: 'warning' },
};

// Ordered awaiting → identified → closed-out so the chips read as a workflow, and
// each carries the map's status color so the filter row doubles as the legend.
const STATUS_ORDER: readonly SampleStatus[] = [
	'awaiting',
	'identified',
	'zero_larvae',
	'unidentifiable',
];

interface DatePreset {
	readonly id: string;
	readonly label: string;
	/** Days back from today the preset spans (inclusive), or null for no bound. */
	readonly days: number | null;
}

const DATE_PRESETS: readonly DatePreset[] = [
	{ id: '7d', label: 'Last 7 days', days: 7 },
	{ id: '30d', label: 'Last 30 days', days: 30 },
	{ id: '90d', label: 'Last 90 days', days: 90 },
	{ id: '12mo', label: 'Last 12 months', days: 365 },
	{ id: 'all', label: 'All time', days: null },
];

/** The window the explorer opens with, and the reset target for "Clear all". */
const DEFAULT_WINDOW_DAYS = 30;

/** How many species result chips a narrow list row shows before collapsing to "+N". */
const RESULT_CHIP_LIMIT = 1;

const PAGE_SIZE = 50;

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

function SamplesExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);

	// Seed from the URL (a deep link from the overview), then own the state locally.
	const search = Route.useSearch();
	const [dateFrom, setDateFrom] = useState(() => search.from ?? defaultFrom);
	const [dateTo, setDateTo] = useState(() => search.to ?? today);
	const [status, setStatus] = useState<StatusFilterValue>(() => search.status ?? 'all');
	const [speciesIds, setSpeciesIds] = useState<ReadonlySet<string>>(() => new Set(search.species));
	const [nonMosquito, setNonMosquito] = useState(() => search.nonMosquito ?? false);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [page, setPage] = useState(0);

	const { nameById, options } = useSpeciesCatalog();

	const filters = useMemo<SampleTileFilters>(
		() => ({
			...(speciesIds.size > 0 ? { speciesIds: [...speciesIds] } : {}),
			...(status === 'all' ? {} : { status }),
			...(nonMosquito ? { nonMosquitoOnly: true } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[speciesIds, status, nonMosquito, dateFrom, dateTo],
	);

	const bounds = useMapBounds(map);
	const { rows, total, isLoading } = useVisibleSamples(bounds, filters, page);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// A new viewport or filter set always starts back at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the viewport + filters.
	useEffect(() => {
		setPage(0);
	}, [bounds, filters]);

	// Clamp if the row count shrinks under the current page.
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedSample(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected sample whenever the resolved selection changes.
	useEffect(() => {
		if (map === null || selected?.lat == null || selected.lng == null) {
			return;
		}
		map.flyTo({
			center: [selected.lng, selected.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 700,
		});
	}, [map, selected?.lat, selected?.lng]);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const sampleLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	// Editing one bound past the other drags the other along so the range never
	// inverts into an empty query.
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
			if (preset.days === null) {
				setDateFrom('');
				setDateTo('');
				return;
			}
			setDateFrom(addDaysToDateString(today, -(preset.days - 1)));
			setDateTo(today);
		},
		[today],
	);

	const activePresetId = useMemo(() => {
		for (const preset of DATE_PRESETS) {
			if (preset.days === null) {
				if (dateFrom === '' && dateTo === '') {
					return preset.id;
				}
				continue;
			}
			if (dateTo === today && dateFrom === addDaysToDateString(today, -(preset.days - 1))) {
				return preset.id;
			}
		}
		return null;
	}, [dateFrom, dateTo, today]);

	const isDefaultRange = dateFrom === defaultFrom && dateTo === today;
	const hasActiveFilters =
		!isDefaultRange || status !== 'all' || speciesIds.size > 0 || nonMosquito;

	const resetDates = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
	}, [defaultFrom, today]);
	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setStatus('all');
		setSpeciesIds(new Set());
		setNonMosquito(false);
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						onMapReady={handleMapReady}
						sampleLayer={sampleLayer}
					/>
					{selected === null ? null : (
						<SampleDetailCard
							nameById={nameById}
							onClose={() => setSelectedId(null)}
							sample={selected}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<SampleIcon aria-hidden="true" className="size-5 text-muted-foreground" />
							<h1 className="font-semibold text-foreground text-lg leading-none">Samples</h1>
						</div>
						<ResultMeta isLoading={isLoading} total={total} />
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

					<StatusFilter onChange={setStatus} value={status} />

					<div className="flex flex-wrap items-center gap-2">
						<SpeciesFilter onChange={setSpeciesIds} options={options} selected={speciesIds} />
						<NonMosquitoToggle onChange={setNonMosquito} value={nonMosquito} />
					</div>

					{hasActiveFilters ? (
						<ActiveFilters
							from={dateFrom}
							isDefaultRange={isDefaultRange}
							nameById={nameById}
							nonMosquito={nonMosquito}
							onClearAll={clearAll}
							onClearNonMosquito={() => setNonMosquito(false)}
							onClearStatus={() => setStatus('all')}
							onResetDates={resetDates}
							onToggleSpecies={(id) => setSpeciesIds(toggle(speciesIds, id))}
							speciesIds={speciesIds}
							status={status}
							to={dateTo}
						/>
					) : null}
				</div>

				<SampleResults
					isLoading={isLoading}
					nameById={nameById}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
				/>

				<div className="border-border/50 border-t p-3">
					<ExplorerPagination
						noun="samples"
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

// --- filter chrome ----------------------------------------------------------

/**
 * Start/end date pickers over the parent-inspection window, with convenience
 * presets. `today` bounds every selection so no future date — where there can be
 * no samples — is reachable.
 */
function DateRangeFilter({
	from,
	to,
	today,
	activePresetId,
	onFromChange,
	onToChange,
	onApplyPreset,
}: {
	readonly from: string;
	readonly to: string;
	readonly today: string;
	readonly activePresetId: string | null;
	readonly onFromChange: (value: string) => void;
	readonly onToChange: (value: string) => void;
	readonly onApplyPreset: (preset: DatePreset) => void;
}) {
	const todayDate = parseLocalDate(today);
	const fromDate = parseLocalDate(from);
	const toDate = parseLocalDate(to);

	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-3">
				<span className="w-14 shrink-0 font-medium text-muted-foreground text-xs">Dates</span>
				<div className="flex flex-1 items-center gap-2">
					<DatePicker
						ariaLabel="Start date"
						className="h-8 flex-1 text-xs"
						max={toDate ?? todayDate}
						onChange={(date) => onFromChange(date === undefined ? '' : formatLocalDate(date))}
						placeholder="Start"
						value={fromDate}
					/>
					<span className="shrink-0 text-muted-foreground text-xs">to</span>
					<DatePicker
						ariaLabel="End date"
						className="h-8 flex-1 text-xs"
						max={todayDate}
						min={fromDate}
						onChange={(date) => onToChange(date === undefined ? '' : formatLocalDate(date))}
						placeholder="End"
						value={toDate}
					/>
				</div>
			</div>
			<div className="flex flex-wrap gap-1.5 pl-[4.25rem]">
				{DATE_PRESETS.map((preset) => {
					const isActive = preset.id === activePresetId;
					return (
						<button
							aria-pressed={isActive}
							className={cn(
								'rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isActive
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
							)}
							key={preset.id}
							onClick={() => onApplyPreset(preset)}
							type="button"
						>
							{preset.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

function ResultMeta({ total, isLoading }: { readonly total: number; readonly isLoading: boolean }) {
	if (isLoading && total === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{total === 0 ? 'None in view' : `${total} in view`}
		</span>
	);
}

/**
 * Lifecycle-status filter as a single-select chip row. Each status chip carries
 * the color it maps to on the map, so the control doubles as the map's legend.
 */
function StatusFilter({
	value,
	onChange,
}: {
	readonly value: StatusFilterValue;
	readonly onChange: (value: StatusFilterValue) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="w-14 shrink-0 pt-1 font-medium text-muted-foreground text-xs">Status</span>
			<div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
				<StatusChip isActive={value === 'all'} label="All" onClick={() => onChange('all')} />
				{STATUS_ORDER.map((option) => (
					<StatusChip
						color={SAMPLE_STATUS_COLORS[option]}
						isActive={value === option}
						key={option}
						label={STATUS_META[option].label}
						onClick={() => onChange(value === option ? 'all' : option)}
					/>
				))}
			</div>
		</div>
	);
}

function StatusChip({
	label,
	color,
	isActive,
	onClick,
}: {
	readonly label: string;
	readonly color?: string | undefined;
	readonly isActive: boolean;
	readonly onClick: () => void;
}) {
	return (
		<button
			aria-pressed={isActive}
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				isActive
					? 'border-primary/50 bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
			)}
			onClick={onClick}
			type="button"
		>
			{color === undefined ? null : (
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
					style={{ backgroundColor: color }}
				/>
			)}
			{label}
		</button>
	);
}

interface SpeciesOption {
	readonly id: string;
	readonly label: string;
}

function SpeciesFilter({
	options,
	selected,
	onChange,
}: {
	readonly options: readonly SpeciesOption[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					aria-label="Filter by species"
					className={cn(
						'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						count > 0
							? 'border-primary bg-primary/10 text-foreground'
							: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
					)}
					type="button"
				>
					<SpeciesIcon aria-hidden="true" className="size-3.5" />
					Species
					{count > 0 ? (
						<Badge className="px-1.5" variant="secondary">
							{count}
						</Badge>
					) : null}
					<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search species…" />
					<CommandList>
						<CommandEmpty>No species in your catalog.</CommandEmpty>
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
										<span className="truncate italic">{option.label}</span>
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

function NonMosquitoToggle({
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
			Non-mosquito material
		</button>
	);
}

function ActiveFilters({
	from,
	to,
	isDefaultRange,
	status,
	speciesIds,
	nonMosquito,
	nameById,
	onResetDates,
	onClearStatus,
	onToggleSpecies,
	onClearNonMosquito,
	onClearAll,
}: {
	readonly from: string;
	readonly to: string;
	readonly isDefaultRange: boolean;
	readonly status: StatusFilterValue;
	readonly speciesIds: ReadonlySet<string>;
	readonly nonMosquito: boolean;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onResetDates: () => void;
	readonly onClearStatus: () => void;
	readonly onToggleSpecies: (id: string) => void;
	readonly onClearNonMosquito: () => void;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{isDefaultRange ? null : (
				<FilterChip label={`Dates: ${dateRangeLabel(from, to)}`} onRemove={onResetDates} />
			)}
			{status !== 'all' ? (
				<FilterChip
					color={SAMPLE_STATUS_COLORS[status]}
					label={STATUS_META[status].label}
					onRemove={onClearStatus}
				/>
			) : null}
			{[...speciesIds].map((id) => (
				<FilterChip
					italic
					key={`species-${id}`}
					label={nameById.get(id) ?? 'Unknown species'}
					onRemove={() => onToggleSpecies(id)}
				/>
			))}
			{nonMosquito ? (
				<FilterChip label="Non-mosquito material" onRemove={onClearNonMosquito} />
			) : null}
			<button
				className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onClearAll}
				type="button"
			>
				Clear all
			</button>
		</div>
	);
}

function FilterChip({
	label,
	color,
	italic = false,
	onRemove,
}: {
	readonly label: string;
	readonly color?: string | undefined;
	readonly italic?: boolean;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-foreground text-xs">
			{color === undefined ? null : (
				<span
					aria-hidden="true"
					className="size-2 shrink-0 rounded-full ring-1 ring-black/10"
					style={{ backgroundColor: color }}
				/>
			)}
			<span className={cn('truncate', italic && 'italic')}>{label}</span>
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

// --- results list -----------------------------------------------------------

function SampleResults({
	rows,
	isLoading,
	selectedId,
	nameById,
	onSelect,
}: {
	readonly rows: readonly SampleFeature[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	if (isLoading && rows.length === 0) {
		return (
			<div className="grid gap-px overflow-y-auto p-2">
				{SKELETON_KEYS.map((key) => (
					<div className="h-[64px] animate-pulse rounded-md bg-muted/60" key={key} />
				))}
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">No samples in view</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Pan or zoom the map, widen the time window, or loosen the filters to bring samples into
					range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((sample) => (
				<SampleListItem
					isSelected={sample.id === selectedId}
					key={sample.id}
					nameById={nameById}
					onSelect={onSelect}
					sample={sample}
				/>
			))}
		</ul>
	);
}

function SampleListItem({
	sample,
	isSelected,
	nameById,
	onSelect,
}: {
	readonly sample: SampleFeature;
	readonly isSelected: boolean;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	// A full-row background button drives map selection, while the habitat name and
	// the inspection chevron are links layered above it (z-10). Sibling interactive
	// elements — not an <a> nested in a <button> — keep the markup valid.
	return (
		<li className="relative">
			<button
				aria-label={`Show ${sampleName(sample)} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(sample.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<StatusDot status={sample.status} />
				<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
					{formatMonthDay(sample.inspectionDate)}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium text-foreground text-sm">
						{sampleName(sample)}
					</span>
					<SampleContext sample={sample} />
				</span>
				<div className="flex shrink-0 items-center gap-1.5">
					{sample.status === 'identified' ? (
						<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={sample} />
					) : (
						<Badge tone={STATUS_META[sample.status].tone} variant="outline">
							{STATUS_META[sample.status].label}
						</Badge>
					)}
				</div>
				<Link
					aria-label={`View the inspection for ${sampleName(sample)}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: sample.inspectionId }}
					title="View inspection"
					to="/larval-surveillance/inspections/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

/** Secondary line: the habitat (linked) or an ad-hoc marker, plus the non-mosquito flag. */
function SampleContext({ sample }: { readonly sample: SampleFeature }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			{sample.habitatId === null ? (
				<span className="truncate italic">Ad-hoc inspection</span>
			) : (
				<Link
					className="pointer-events-auto relative z-10 truncate rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: sample.habitatId }}
					to="/larval-surveillance/habitats/$id"
				>
					{sample.habitatName?.trim() || `Habitat ${sample.habitatId.slice(0, 8)}`}
				</Link>
			)}
			{sample.hasNonMosquito ? (
				<>
					<span aria-hidden="true">·</span>
					<span className="shrink-0">Non-mosquito</span>
				</>
			) : null}
		</span>
	);
}

/** Identified species as compact "name · count" chips, overflow collapsed to "+N". */
function SpeciesResults({
	sample,
	nameById,
	limit,
}: {
	readonly sample: SampleFeature;
	readonly nameById: ReadonlyMap<string, string>;
	readonly limit: number;
}) {
	const shown = sample.results.slice(0, limit);
	const overflow = sample.results.length - shown.length;

	return (
		<div className="flex items-center gap-1">
			{shown.map((result) => (
				<span
					className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/25 bg-[var(--success-bg)] px-2 py-0.5 text-[var(--success)] text-xs"
					key={result.speciesId}
					title={`${nameById.get(result.speciesId) ?? 'Unknown species'}: ${result.larvaeCount.toLocaleString()} larvae`}
				>
					<span className="max-w-[8rem] truncate italic">
						{nameById.get(result.speciesId) ?? 'Unknown species'}
					</span>
					<span className="shrink-0 tabular-nums opacity-80">{result.larvaeCount}</span>
				</span>
			))}
			{overflow > 0 ? (
				<span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
					+{overflow}
				</span>
			) : null}
		</div>
	);
}

function StatusDot({ status }: { readonly status: SampleStatus }) {
	return (
		<span
			aria-hidden="true"
			className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
			style={{ backgroundColor: SAMPLE_STATUS_COLORS[status] }}
			title={STATUS_META[status].label}
		/>
	);
}

// --- selected sample detail card --------------------------------------------

function SampleDetailCard({
	sample,
	nameById,
	onClose,
}: {
	readonly sample: SampleFeature;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onClose: () => void;
}) {
	const meta = STATUS_META[sample.status];
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[460px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 grid gap-0.5">
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<CalendarIcon aria-hidden="true" className="size-3.5" />
							<span className="tabular-nums">{formatFullDate(sample.inspectionDate)}</span>
						</div>
						<h2 className="truncate font-semibold text-base text-foreground leading-tight">
							{sampleName(sample)}
						</h2>
						<p className="truncate text-muted-foreground text-sm">
							{sample.habitatId === null ? (
								<span className="italic">Ad-hoc inspection</span>
							) : (
								<Link
									className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									params={{ id: sample.habitatId }}
									to="/larval-surveillance/habitats/$id"
								>
									{sample.habitatName?.trim() || `Habitat ${sample.habitatId.slice(0, 8)}`}
								</Link>
							)}
						</p>
					</div>
					<div className="flex items-center gap-1.5">
						<Badge tone={meta.tone} variant="outline">
							{meta.label}
						</Badge>
						<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
							<XIcon aria-hidden="true" />
						</Button>
					</div>
				</div>

				{sample.results.length > 0 ? (
					<div className="mt-3 flex flex-wrap gap-1.5">
						{sample.results.map((result) => (
							<span
								className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/25 bg-[var(--success-bg)] px-2 py-0.5 text-[var(--success)] text-xs"
								key={result.speciesId}
							>
								<span className="italic">
									{nameById.get(result.speciesId) ?? 'Unknown species'}
								</span>
								<span className="tabular-nums opacity-80">
									{result.larvaeCount.toLocaleString()}
								</span>
							</span>
						))}
					</div>
				) : null}

				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<DetailFact label="Larvae counted" value={countLabel(sample.larvaeTotal)} />
					<DetailFact
						label="Identified"
						value={sample.identifiedAt === null ? 'Not yet' : formatFullDate(sample.identifiedAt)}
					/>
					<DetailFact
						label="Non-mosquito"
						value={sample.hasNonMosquito ? 'Present' : 'None noted'}
					/>
					<DetailFact label="Coordinates" value={coordinateLabel(sample)} />
					{sample.unidentifiableReason === null ? null : (
						<DetailFact label="Unidentifiable" value={sample.unidentifiableReason} wide />
					)}
				</dl>

				<div className="mt-3 flex justify-end gap-2">
					<Button asChild size="sm" variant="ghost">
						<Link params={{ id: sample.inspectionId }} to="/larval-surveillance/inspections/$id">
							View inspection
						</Link>
					</Button>
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: sample.id }} to="/larval-surveillance/samples/$id">
							View sample
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

// --- data hooks -------------------------------------------------------------

/**
 * Species names + the org's species options for the filter. Names resolve from
 * the eager global taxonomy; the filter offers only the species the org has
 * adopted (falling back to the full catalog if the org hasn't curated a list).
 */
function useSpeciesCatalog(): {
	readonly nameById: ReadonlyMap<string, string>;
	readonly options: readonly SpeciesOption[];
} {
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const { rows: orgSpecies } = useCollectionRows<OrganizationSpeciesRow>(
		webCollections.organizationSpecies,
	);

	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);

	const options = useMemo(() => {
		const orgIds = new Set(orgSpecies.map((row) => row.speciesId));
		const source = orgIds.size > 0 ? species.filter((row) => orgIds.has(row.id)) : species;
		return source
			.map((row) => ({ id: row.id, label: row.displayName }))
			.sort((first, second) => first.label.localeCompare(second.label));
	}, [species, orgSpecies]);

	return { nameById, options };
}

function useVisibleSamples(
	bounds: BoundingBox | null,
	filters: SampleTileFilters,
	page: number,
): {
	readonly rows: readonly SampleFeature[];
	readonly total: number;
	readonly isLoading: boolean;
} {
	const bbox = bounds === null ? null : formatBoundingBox(bounds);
	const query = useQuery({
		enabled: bbox !== null,
		queryKey: ['samples', 'visible', bbox, filters, page],
		queryFn: ({ signal }) => fetchVisibleSamples(bounds, filters, page, signal),
		placeholderData: (previous) => previous,
	});

	return {
		rows: query.data?.rows ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

function useSelectedSample(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, SampleFeature>,
): SampleFeature | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['samples', 'detail', selectedId],
		queryFn: ({ signal }) => fetchSampleById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchVisibleSamples(
	bounds: BoundingBox | null,
	filters: SampleTileFilters,
	page: number,
	signal: AbortSignal,
): Promise<{ readonly rows: SampleFeature[]; readonly total: number }> {
	if (bounds === null) {
		return { rows: [], total: 0 };
	}
	const url = new URL('/map/samples', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(normalizeBounds(bounds)));
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	if (filters.speciesIds !== undefined && filters.speciesIds.length > 0) {
		url.searchParams.set('species', [...filters.speciesIds].join(','));
	}
	if (filters.status !== undefined) {
		url.searchParams.set('status', filters.status);
	}
	if (filters.nonMosquitoOnly === true) {
		url.searchParams.set('nonMosquito', 'true');
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Samples request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly samples?: SampleFeature[];
		readonly total?: number;
	};
	return { rows: body.samples ?? [], total: body.total ?? 0 };
}

async function fetchSampleById(id: string, signal: AbortSignal): Promise<SampleFeature | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/samples/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly sample?: SampleFeature };
	return body.sample ?? null;
}

function useMapBounds(map: MapboxMap | null): BoundingBox | null {
	const [bounds, setBounds] = useState<BoundingBox | null>(null);

	useEffect(() => {
		if (map === null) {
			setBounds(null);
			return;
		}
		const update = () => {
			const next = map.getBounds();
			if (next === null) {
				return;
			}
			const candidate: BoundingBox = {
				east: next.getEast(),
				north: next.getNorth(),
				south: next.getSouth(),
				west: next.getWest(),
			};
			setBounds((current) =>
				current !== null &&
				formatBoundingBox(normalizeBounds(current)) ===
					formatBoundingBox(normalizeBounds(candidate))
					? current
					: candidate,
			);
		};

		update();
		map.on('moveend', update);
		map.on('zoomend', update);
		map.on('resize', update);
		return () => {
			map.off('moveend', update);
			map.off('zoomend', update);
			map.off('resize', update);
		};
	}, [map]);

	return bounds;
}

// --- helpers ----------------------------------------------------------------

function sampleName(sample: SampleFeature): string {
	return sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`;
}

function toggle<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
	const next = new Set(set);
	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}
	return next;
}

/** Parse a `YYYY-MM-DD` string to a local Date, or undefined when empty/invalid. */
function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [year, month, day] = value.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Format a local Date back to a `YYYY-MM-DD` string (its own calendar day). */
function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Human label for the active range chip, tolerating open-ended bounds. */
function dateRangeLabel(from: string, to: string): string {
	if (from === '' && to === '') {
		return 'All dates';
	}
	if (from === '') {
		return `Until ${formatMonthDay(to)}`;
	}
	if (to === '') {
		return `From ${formatMonthDay(from)}`;
	}
	return `${formatMonthDay(from)} – ${formatMonthDay(to)}`;
}

function countLabel(value: number): string {
	return value <= 0 ? '—' : value.toLocaleString();
}

function coordinateLabel(sample: SampleFeature): string {
	if (sample.lat == null || sample.lng == null) {
		return 'Unknown';
	}
	return `${sample.lat.toFixed(4)}, ${sample.lng.toFixed(4)}`;
}

function formatFullDate(date: string): string {
	const parts = date.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return date;
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Clamp to valid lng/lat and collapse a world-spanning view to a single box. */
function normalizeBounds(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const span = bounds.east - bounds.west;
	if (!Number.isFinite(span) || span >= 360) {
		return { east: 180, north, south, west: -180 };
	}
	const west = clamp(bounds.west, -180, 180);
	const east = clamp(bounds.east, -180, 180);
	if (west > east) {
		return { east: 180, north, south, west: -180 };
	}
	return { east, north, south, west };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
