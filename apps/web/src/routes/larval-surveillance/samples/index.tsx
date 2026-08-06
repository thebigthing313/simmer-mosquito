import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { OrganizationSpeciesRow, SpeciesRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import { CheckIcon, ChevronDownIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	ResultList,
	ToggleFilter,
	toggle,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas, SAMPLE_STATUS_COLORS, type SampleTileFilters } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { adhocLabel } from '../../../lib/coordinate-label';
import { formatLocalDate, parseLocalDate } from '../../../lib/local-date';
import { searchValidator, useSearchFilters } from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
import {
	addDaysToDateString,
	formatListDate,
	formatMonthDay,
	todayInTimeZone,
} from '../-overview-data';
import { SampleMapCard } from '../-sample-map-card';
import { type SampleFilters, sampleFilterCodecs } from '../-samples-search';

const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

export const Route = createFileRoute('/larval-surveillance/samples/')({
	component: SamplesExplorerRoute,
	validateSearch: searchValidator(sampleFilterCodecs),
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

function SamplesExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);
	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);

	// The filter state lives in the URL, so a deep link, a shared link, and Back
	// out of a record all land on the same view.
	const filterDefaults = useMemo<SampleFilters>(
		() => ({
			from: defaultFrom,
			to: today,
			status: 'all',
			species: new Set(),
			nonMosquito: false,
			regions: new Set(),
		}),
		[defaultFrom, today],
	);
	const {
		filters: query,
		setFilters,
		reset,
	} = useSearchFilters(filterDefaults, sampleFilterCodecs);
	const dateFrom = query.from;
	const dateTo = query.to;
	const status = query.status;
	const speciesIds = query.species;
	const nonMosquito = query.nonMosquito;
	const regionIds = query.regions;
	const setStatus = useCallback(
		(next: StatusFilterValue) => setFilters({ status: next }),
		[setFilters],
	);
	const setSpeciesIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ species: next }),
		[setFilters],
	);
	const setNonMosquito = useCallback(
		(next: boolean) => setFilters({ nonMosquito: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [page, setPage] = useState(0);

	const { nameById, options } = useSpeciesCatalog();
	const regions = useRegionOptions();

	const filters = useMemo<SampleTileFilters>(
		() => ({
			...(speciesIds.size > 0 ? { speciesIds: [...speciesIds] } : {}),
			...(status === 'all' ? {} : { status }),
			...(nonMosquito ? { nonMosquitoOnly: true } : {}),
			...(regionIds.size > 0 ? { regionIds: [...regionIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[speciesIds, status, nonMosquito, regionIds, dateFrom, dateTo],
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
			if (preset.days === null) {
				setFilters({ from: '', to: '' });
				return;
			}
			setFilters({ from: addDaysToDateString(today, -(preset.days - 1)), to: today });
		},
		[setFilters, today],
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
		!isDefaultRange || status !== 'all' || speciesIds.size > 0 || nonMosquito || regionIds.size > 0;

	const resetDates = useCallback(
		() => setFilters({ from: defaultFrom, to: today }),
		[setFilters, defaultFrom, today],
	);
	const clearAll = reset;

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false, measure: true }}
						fitToData
						onMapReady={handleMapReady}
						sampleLayer={sampleLayer}
					/>
					{selected === null ? null : (
						<SampleMapCard id={selected.id} onClose={() => setSelectedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
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
						<MultiSelectFilter
							empty="No regions"
							label="Region"
							onChange={setRegionIds}
							options={regions.options}
							selected={regionIds}
						/>
						<ToggleFilter
							label="Non-mosquito material"
							onChange={setNonMosquito}
							value={nonMosquito}
						/>
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
							onToggleRegion={(id) => setRegionIds(toggle(regionIds, id))}
							onToggleSpecies={(id) => setSpeciesIds(toggle(speciesIds, id))}
							regionIds={regionIds}
							regionNameById={regions.nameById}
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

function ActiveFilters({
	from,
	to,
	isDefaultRange,
	status,
	speciesIds,
	nonMosquito,
	nameById,
	regionIds,
	regionNameById,
	onResetDates,
	onClearStatus,
	onToggleSpecies,
	onClearNonMosquito,
	onToggleRegion,
	onClearAll,
}: {
	readonly from: string;
	readonly to: string;
	readonly isDefaultRange: boolean;
	readonly status: StatusFilterValue;
	readonly speciesIds: ReadonlySet<string>;
	readonly nonMosquito: boolean;
	readonly nameById: ReadonlyMap<string, string>;
	readonly regionIds: ReadonlySet<string>;
	readonly regionNameById: ReadonlyMap<string, string>;
	readonly onResetDates: () => void;
	readonly onClearStatus: () => void;
	readonly onToggleSpecies: (id: string) => void;
	readonly onClearNonMosquito: () => void;
	readonly onToggleRegion: (id: string) => void;
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
			{[...regionIds].map((id) => (
				<FilterChip
					key={`region-${id}`}
					label={regionNameById.get(id) ?? 'Unknown region'}
					onRemove={() => onToggleRegion(id)}
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
	return (
		<ResultList
			emptyDescription="Pan or zoom the map, widen the time window, or loosen the filters to bring samples into range."
			emptyTitle="No samples in view"
			isLoading={isLoading}
			rows={rows}
			skeletonClassName="h-[64px]"
		>
			{(sample) => (
				<SampleListItem
					isSelected={sample.id === selectedId}
					key={sample.id}
					nameById={nameById}
					onSelect={onSelect}
					sample={sample}
				/>
			)}
		</ResultList>
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
	const label = sampleName(sample);
	return (
		<ExplorerRow
			badges={
				sample.status === 'identified' ? (
					<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={sample} />
				) : (
					<Badge tone={STATUS_META[sample.status].tone} variant="outline">
						{STATUS_META[sample.status].label}
					</Badge>
				)
			}
			date={formatListDate(sample.inspectionDate)}
			detailLabel={`View details for ${label}`}
			detailLink={{ to: '/larval-surveillance/samples/$id', params: { id: sample.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(sample.id)}
			selectLabel={`Show ${label} on the map`}
			subtitle={<SampleContext sample={sample} />}
			swatch={sampleSwatch(sample)}
			title={label}
		/>
	);
}

/** The status colour this sample draws in, so the row matches the map. */
function sampleSwatch(sample: SampleFeature): { readonly color: string; readonly label: string } {
	const color = SAMPLE_STATUS_COLORS[sample.status];
	return {
		color: color ?? 'var(--muted-foreground)',
		label: STATUS_META[sample.status].label,
	};
}

/** Secondary line: the habitat (linked) or an ad-hoc marker, plus the non-mosquito flag. */
function SampleContext({ sample }: { readonly sample: SampleFeature }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
			{sample.habitatId === null ? (
				<span className="truncate tabular-nums">{adhocLabel(sample.lat, sample.lng)}</span>
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

function _StatusDot({ status }: { readonly status: SampleStatus }) {
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
	if (filters.regionIds !== undefined && filters.regionIds.length > 0) {
		url.searchParams.set('regionId', [...filters.regionIds].join(','));
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
