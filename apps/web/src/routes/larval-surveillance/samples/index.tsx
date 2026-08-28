import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import { CheckIcon, ChevronDownIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
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
	ToggleFilter,
	toggle,
	useDateRangeFilters,
	useExplorerPanel,
	useFlyToSelection,
	useMapBoundsParam,
	usePagedMapResource,
	useRegionOptions,
	useSelectedMapRecord,
	useSpeciesOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	MAP_CREATE_TARGETS,
	MapCanvas,
	SAMPLE_STATUS_COLORS,
	type SampleTileFilters,
} from '../../../components/map';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { adhocLabel } from '../../../lib/coordinate-label';
import {
	DATE_RANGE_COUNTING,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import {
	addDaysToDateString,
	formatListDate,
	formatMonthDay,
	todayInTimeZone,
} from '../-overview-data';
import { SampleMapCard } from '../-sample-map-card';
import { type SampleFilters, sampleFilterCodecs } from '../-samples-search';
import type { SampleStatus } from './-legend';
import { SAMPLE_STATUS_ORDER, sampleLegend, sampleStatusLabel } from './-legend';

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

/** The window the explorer opens with, and the reset target for "Clear all". */
const DEFAULT_WINDOW_DAYS = 30;

/** How many species result chips a narrow list row shows before collapsing to "+N". */
const RESULT_CHIP_LIMIT = 1;

const PATH = '/map/samples';

function SamplesExplorerRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
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
		activeCount: activeFilterCount,
	} = useSearchFilters(filterDefaults, sampleFilterCodecs, DATE_RANGE_COUNTING);
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
	const panel = useExplorerPanel();
	const dateRange = useDateRangeFilters({ from: dateFrom, to: dateTo, today, setFilters });

	const { nameById, options } = useSpeciesOptions();
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

	const bbox = useMapBoundsParam(map);
	const params = useMemo(
		() =>
			mapQueryParams({
				bbox,
				species: filters.speciesIds,
				status: filters.status,
				nonMosquito: filters.nonMosquitoOnly,
				regionId: filters.regionIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
			}),
		[bbox, filters],
	);
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SampleFeature>({
			path: PATH,
			rowsKey: 'samples',
			label: 'Samples',
			params,
			enabled: bbox !== null,
		});

	const selected = useSelectedMapRecord<SampleFeature>({
		path: PATH,
		rowKey: 'sample',
		rows,
		selectedId,
	});

	useFlyToSelection(map, selected);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const sampleLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const isDefaultRange = dateFrom === defaultFrom && dateTo === today;
	const legend = useMemo(() => sampleLegend(status), [status]);

	const resetDates = useCallback(
		() => setFilters({ from: defaultFrom, to: today }),
		[setFilters, defaultFrom, today],
	);
	const clearAll = reset;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<DateRangeFilter {...dateRange} />

					<StatusFilter onChange={setStatus} value={status} />

					<FilterGrid>
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
					</FilterGrid>

					{activeFilterCount > 0 ? (
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
				</>
			}
			footer={
				<ExplorerPagination
					noun={{ one: 'sample', many: 'samples' }}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Samples',
				icon: SampleIcon,
				total,
				isLoading,
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.inspection] }}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						legend={legend}
						onMapReady={handleMapReady}
						sampleLayer={sampleLayer}
					/>
					{selected === null ? null : (
						<SampleMapCard
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
				skeletonClassName: 'h-[64px]',
				emptyTitle: 'No samples in view',
				emptyDescription:
					'Pan or zoom the map, widen the time window, or loosen the filters to bring samples into range.',
				renderRow: (sample) => (
					<SampleListItem
						isSelected={sample.id === selectedId}
						key={sample.id}
						nameById={nameById}
						onSelect={setSelectedId}
						sample={sample}
					/>
				),
			}}
		/>
	);
}

// --- filter chrome ----------------------------------------------------------

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
				{SAMPLE_STATUS_ORDER.map((option) => (
					<StatusChip
						color={SAMPLE_STATUS_COLORS[option]}
						isActive={value === option}
						key={option}
						label={sampleStatusLabel(option)}
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
		<ActiveFilterBar onClearAll={onClearAll}>
			{isDefaultRange ? null : (
				<FilterChip label={`Dates: ${dateRangeLabel(from, to)}`} onRemove={onResetDates} />
			)}
			{status !== 'all' ? (
				<FilterChip
					color={SAMPLE_STATUS_COLORS[status]}
					label={sampleStatusLabel(status)}
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
		</ActiveFilterBar>
	);
}

// --- results list -----------------------------------------------------------

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
			/*
			 * Species only. The status pill repeated the dot at the left of the row,
			 * which is already the status and already the colour the map paints this
			 * sample. What was found in it is the one thing neither says.
			 *
			 * `null` rather than omitted for a sample that has no results yet, so every
			 * row in the rail keeps the same shape.
			 */
			badges={
				sample.status === 'identified' ? (
					<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={sample} />
				) : null
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
		label: sampleStatusLabel(sample.status),
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
			title={sampleStatusLabel(status)}
		/>
	);
}

// --- selected sample detail card --------------------------------------------

// --- data hooks -------------------------------------------------------------

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
