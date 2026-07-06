import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { HabitatTypeRow, LarvalDensity } from '@simmer-mosquito/sync';
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
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	MapPinnedIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	type InspectionTileFilters,
	MapCanvas,
} from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { inspectionsSearchSchema } from '../-inspections-search';
import {
	DensityBadge,
	densityLabel,
	hasAnyLifeStage,
	LifeStageStrip,
	WetnessBadge,
} from '../-larval-display';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/larval-surveillance/inspections/')({
	component: InspectionsExplorerRoute,
	validateSearch: (search) => inspectionsSearchSchema.parse(search),
});

/**
 * One inspection as returned by `/map/inspections` — the owned-geometry projection
 * plus the record fields and the joined habitat / address / inspector labels the
 * list and detail card need to identify a row (an inspection has no name of its own).
 */
interface InspectionSite {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

type WetFilter = 'all' | 'wet' | 'dry';

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

const WETNESS_OPTIONS: readonly { readonly value: WetFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'wet', label: 'Wet' },
	{ value: 'dry', label: 'Dry' },
];

// Ordered low → high so the filter chips read as the map's heat ramp legend.
const DENSITY_ORDER: readonly LarvalDensity[] = ['none', 'light', 'medium', 'heavy', 'very_heavy'];

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

function InspectionsExplorerRoute() {
	const today = useMemo(() => todayInTimeZone(undefined), []);

	const defaultFrom = useMemo(
		() => addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		[today],
	);

	// Seed the filter state from the URL search params (a deep link from the
	// overview's "view on map" actions), falling back to the explorer's defaults.
	// State is local from here on; the params only prime the initial view.
	const search = Route.useSearch();
	const [dateFrom, setDateFrom] = useState(() => search.from ?? defaultFrom);
	const [dateTo, setDateTo] = useState(() => search.to ?? today);
	const [wetness, setWetness] = useState<WetFilter>(() => search.water ?? 'all');
	const [densities, setDensities] = useState<ReadonlySet<LarvalDensity>>(
		() => new Set(search.density),
	);
	const [positiveOnly, setPositiveOnly] = useState(() => search.positive ?? false);
	const [typeIds, setTypeIds] = useState<ReadonlySet<string>>(() => new Set(search.types));
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);
	const typeNameById = useMemo(
		() => new Map(habitatTypes.map((type) => [type.id, type.name])),
		[habitatTypes],
	);

	const filters = useMemo<InspectionTileFilters>(
		() => ({
			...(wetness === 'all' ? {} : { isWet: wetness === 'wet' }),
			...(densities.size > 0 ? { densities: [...densities] } : {}),
			...(positiveOnly ? { positiveOnly: true } : {}),
			...(typeIds.size > 0 ? { habitatTypeIds: [...typeIds] } : {}),
			...(dateFrom === '' ? {} : { dateFrom }),
			...(dateTo === '' ? {} : { dateTo }),
		}),
		[wetness, densities, positiveOnly, typeIds, dateFrom, dateTo],
	);

	// Editing one bound past the other drags the other along, so the range never
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

	// Which preset (if any) the current range exactly matches — drives chip highlight.
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

	const bounds = useMapBounds(map);
	const { rows, isLoading } = useVisibleInspections(bounds, filters);

	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const fallbackSelected = useSelectedInspection(selectedId, visibleById);
	const selected =
		selectedId === null ? null : (visibleById.get(selectedId) ?? fallbackSelected ?? null);

	// Fly to the selected inspection whenever the resolved selection changes.
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
	const inspectionLayer = useMemo(
		() => ({ serverUrl: getServerUrl(), filters, selectedId, onSelectFeature: setSelectedId }),
		[filters, selectedId],
	);

	const isDefaultRange = dateFrom === defaultFrom && dateTo === today;
	const hasActiveFilters =
		!isDefaultRange || wetness !== 'all' || densities.size > 0 || positiveOnly || typeIds.size > 0;

	const resetDates = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
	}, [defaultFrom, today]);

	const clearAll = useCallback(() => {
		setDateFrom(defaultFrom);
		setDateTo(today);
		setWetness('all');
		setDensities(new Set());
		setPositiveOnly(false);
		setTypeIds(new Set());
	}, [defaultFrom, today]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						inspectionLayer={inspectionLayer}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<InspectionDetailCard
							inspection={selected}
							typeName={resolveTypeName(selected, typeNameById)}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex items-baseline justify-between gap-3">
						<h1 className="font-semibold text-foreground text-lg leading-none">Inspections</h1>
						<ResultMeta count={rows.length} isLoading={isLoading} />
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

					<SegmentedFilter
						label="Water"
						onChange={setWetness}
						options={WETNESS_OPTIONS}
						value={wetness}
					/>

					<DensityFilter onChange={setDensities} selected={densities} />

					<div className="flex flex-wrap items-center gap-2">
						<PositiveToggle onChange={setPositiveOnly} value={positiveOnly} />
						<MultiSelectFilter
							empty="No habitat types"
							label="Habitat type"
							onChange={setTypeIds}
							options={habitatTypes.map((type) => ({ id: type.id, label: type.name }))}
							selected={typeIds}
						/>
					</div>

					{hasActiveFilters ? (
						<ActiveFilters
							densities={densities}
							from={dateFrom}
							isDefaultRange={isDefaultRange}
							onClearAll={clearAll}
							onClearPositive={() => setPositiveOnly(false)}
							onClearWetness={() => setWetness('all')}
							onResetDates={resetDates}
							onToggleDensity={(value) => setDensities(toggle(densities, value))}
							onToggleType={(id) => setTypeIds(toggle(typeIds, id))}
							positiveOnly={positiveOnly}
							to={dateTo}
							typeIds={typeIds}
							typeNameById={typeNameById}
							wetness={wetness}
						/>
					) : null}
				</div>

				<InspectionResults
					isLoading={isLoading}
					onSelect={setSelectedId}
					rows={rows}
					selectedId={selectedId}
					typeNameById={typeNameById}
				/>
			</div>
		</MapSplitPage>
	);
}

/**
 * Start/end date pickers over the inspection window, with convenience presets.
 * The pickers are the primary control (an explicit range); the presets are quick
 * shortcuts that fill both. `today` bounds every selection so no future date —
 * where there can be no inspections — is reachable.
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

function ResultMeta({ count, isLoading }: { readonly count: number; readonly isLoading: boolean }) {
	if (isLoading && count === 0) {
		return <span className="text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{count === 0 ? 'None in view' : count >= 50 ? '50+ in view' : `${count} in view`}
		</span>
	);
}

function SegmentedFilter<T extends string>({
	label,
	icon,
	value,
	onChange,
	options,
}: {
	readonly label: string;
	readonly icon?: ReactNode;
	readonly value: T;
	readonly onChange: (value: T) => void;
	readonly options: readonly { readonly value: T; readonly label: string }[];
}) {
	return (
		<div className="flex items-center gap-3">
			<span className="flex w-14 shrink-0 items-center gap-1 font-medium text-muted-foreground text-xs">
				{icon}
				{label}
			</span>
			<ToggleGroup
				aria-label={label}
				className="flex-1"
				onValueChange={(next) => {
					if (next) {
						onChange(next as T);
					}
				}}
				size="sm"
				type="single"
				value={value}
				variant="outline"
			>
				{options.map((option) => (
					<ToggleGroupItem className="flex-1 text-xs" key={option.value} value={option.value}>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/**
 * Larval-density multi-select rendered as a chip row, each chip carrying the heat
 * color it maps to on the map — so the filter doubles as the map's legend.
 */
function DensityFilter({
	selected,
	onChange,
}: {
	readonly selected: ReadonlySet<LarvalDensity>;
	readonly onChange: (next: ReadonlySet<LarvalDensity>) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="w-14 shrink-0 pt-1 font-medium text-muted-foreground text-xs">Density</span>
			<fieldset className="m-0 flex min-w-0 flex-1 flex-wrap gap-1.5 border-0 p-0">
				<legend className="sr-only">Filter by larval density</legend>
				{DENSITY_ORDER.map((value) => {
					const isSelected = selected.has(value);
					return (
						<button
							aria-pressed={isSelected}
							className={cn(
								'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isSelected
									? 'border-primary/50 bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
							)}
							key={value}
							onClick={() => onChange(toggle(selected, value))}
							type="button"
						>
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
								style={{ backgroundColor: INSPECTION_DENSITY_COLORS[value] }}
							/>
							{densityLabel(value)}
						</button>
					);
				})}
			</fieldset>
		</div>
	);
}

function PositiveToggle({
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
			Larvae found only
		</button>
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

function ActiveFilters({
	from,
	to,
	isDefaultRange,
	wetness,
	densities,
	positiveOnly,
	typeIds,
	typeNameById,
	onResetDates,
	onClearWetness,
	onToggleDensity,
	onClearPositive,
	onToggleType,
	onClearAll,
}: {
	readonly from: string;
	readonly to: string;
	readonly isDefaultRange: boolean;
	readonly wetness: WetFilter;
	readonly densities: ReadonlySet<LarvalDensity>;
	readonly positiveOnly: boolean;
	readonly typeIds: ReadonlySet<string>;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly onResetDates: () => void;
	readonly onClearWetness: () => void;
	readonly onToggleDensity: (value: LarvalDensity) => void;
	readonly onClearPositive: () => void;
	readonly onToggleType: (id: string) => void;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{isDefaultRange ? null : (
				<FilterChip label={`Dates: ${dateRangeLabel(from, to)}`} onRemove={onResetDates} />
			)}
			{wetness !== 'all' ? (
				<FilterChip
					label={`Water: ${wetness === 'wet' ? 'Wet' : 'Dry'}`}
					onRemove={onClearWetness}
				/>
			) : null}
			{DENSITY_ORDER.filter((value) => densities.has(value)).map((value) => (
				<FilterChip
					color={INSPECTION_DENSITY_COLORS[value]}
					key={`density-${value}`}
					label={densityLabel(value)}
					onRemove={() => onToggleDensity(value)}
				/>
			))}
			{positiveOnly ? <FilterChip label="Larvae found" onRemove={onClearPositive} /> : null}
			{[...typeIds].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={typeNameById.get(id) ?? 'Unknown type'}
					onRemove={() => onToggleType(id)}
				/>
			))}
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
	onRemove,
}: {
	readonly label: string;
	readonly color?: string | undefined;
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

function InspectionResults({
	rows,
	isLoading,
	selectedId,
	typeNameById,
	onSelect,
}: {
	readonly rows: readonly InspectionSite[];
	readonly isLoading: boolean;
	readonly selectedId: string | null;
	readonly typeNameById: ReadonlyMap<string, string>;
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
				<p className="font-medium text-foreground text-sm">No inspections in view</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					Pan or zoom the map, widen the time window, or loosen the filters to bring inspections
					into range.
				</p>
			</div>
		);
	}

	return (
		<ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
			{rows.map((inspection) => (
				<InspectionListItem
					inspection={inspection}
					isSelected={inspection.id === selectedId}
					key={inspection.id}
					onSelect={onSelect}
					typeName={resolveTypeName(inspection, typeNameById)}
				/>
			))}
		</ul>
	);
}

function InspectionListItem({
	inspection,
	typeName,
	isSelected,
	onSelect,
}: {
	readonly inspection: InspectionSite;
	readonly typeName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	// A full-row background button drives map selection, while the habitat name is a
	// Link layered above it (z-10). Sibling interactive elements — not an <a> nested
	// in a <button> — keeps the markup valid while both behaviors coexist.
	return (
		<li className="relative">
			<button
				aria-label={`Show the ${formatMonthDay(inspection.inspectionDate)} inspection of ${siteLabel(inspection)} on the map`}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={() => onSelect(inspection.id)}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				<DensityDot inspection={inspection} />
				<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
					{formatMonthDay(inspection.inspectionDate)}
				</span>
				<span className="min-w-0 flex-1">
					<SiteLink inspection={inspection} />
					<span className="block truncate text-muted-foreground text-xs">{typeName}</span>
				</span>
				<div className="flex shrink-0 items-center gap-1.5">
					{inspection.isWet ? (
						<DensityBadge density={inspection.density} />
					) : (
						<WetnessBadge isWet={false} />
					)}
					{inspection.isWet && hasAnyLifeStage(inspection) ? (
						<LifeStageStrip size="sm" stages={inspection} />
					) : null}
				</div>
				<Link
					aria-label={`View details for the ${formatMonthDay(inspection.inspectionDate)} inspection of ${siteLabel(inspection)}`}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					params={{ id: inspection.id }}
					title="View inspection details"
					to="/larval-surveillance/inspections/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

/** Habitat name as a link to the record, or a muted "Ad-hoc" when unlinked. */
function SiteLink({ inspection }: { readonly inspection: InspectionSite }) {
	if (inspection.habitatId === null) {
		return (
			<span className="block truncate text-muted-foreground text-sm italic">Ad-hoc inspection</span>
		);
	}
	return (
		<Link
			className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
			params={{ id: inspection.habitatId }}
			to="/larval-surveillance/habitats/$id"
		>
			{siteLabel(inspection)}
		</Link>
	);
}

function InspectionDetailCard({
	inspection,
	typeName,
	onClose,
}: {
	readonly inspection: InspectionSite;
	readonly typeName: string;
	readonly onClose: () => void;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[460px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 grid gap-0.5">
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<CalendarIcon aria-hidden="true" className="size-3.5" />
							<span className="tabular-nums">{formatFullDate(inspection.inspectionDate)}</span>
						</div>
						<h2 className="truncate font-semibold text-base text-foreground leading-tight">
							{inspection.habitatId === null ? (
								<span className="text-muted-foreground italic">Ad-hoc inspection</span>
							) : (
								<Link
									className="block w-fit max-w-full truncate rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
									params={{ id: inspection.habitatId }}
									to="/larval-surveillance/habitats/$id"
								>
									{siteLabel(inspection)}
								</Link>
							)}
						</h2>
						<p className="truncate text-muted-foreground text-sm">{typeName}</p>
					</div>
					<div className="flex items-center gap-1.5">
						{inspection.isWet ? (
							<DensityBadge density={inspection.density} />
						) : (
							<WetnessBadge isWet={false} />
						)}
						<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
							<XIcon aria-hidden="true" />
						</Button>
					</div>
				</div>

				{inspection.isWet && hasAnyLifeStage(inspection) ? (
					<div className="mt-3">
						<LifeStageStrip stages={inspection} />
					</div>
				) : null}

				<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
					<DetailFact label="Inspector" value={inspection.inspectedByName ?? 'Unassigned'} />
					<DetailFact label="Water" value={inspection.isWet ? 'Wet' : 'Dry — no larvae possible'} />
					<DetailFact label="Dips" value={countLabel(inspection.dipCount)} />
					<DetailFact label="Larvae counted" value={countLabel(inspection.larvaeCount)} />
					{inspection.addressDisplayName === null ? null : (
						<DetailFact label="Address" value={inspection.addressDisplayName} wide />
					)}
					<DetailFact label="Coordinates" value={coordinateLabel(inspection)} wide />
				</dl>

				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: inspection.id }} to="/larval-surveillance/inspections/$id">
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

function DensityDot({ inspection }: { readonly inspection: InspectionSite }) {
	const color = !inspection.isWet
		? INSPECTION_DRY_COLOR
		: (INSPECTION_DENSITY_COLORS[inspection.density ?? 'none'] ?? INSPECTION_DENSITY_COLORS.none);
	const title = inspection.isWet ? densityLabel(inspection.density) : 'Dry';
	return (
		<span
			aria-hidden="true"
			className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
			style={{ backgroundColor: color }}
			title={title}
		/>
	);
}

// --- data hooks -------------------------------------------------------------

function useVisibleInspections(
	bounds: BoundingBox | null,
	filters: InspectionTileFilters,
): { readonly rows: readonly InspectionSite[]; readonly isLoading: boolean } {
	const bbox = bounds === null ? null : formatBoundingBox(bounds);
	const query = useQuery({
		enabled: bbox !== null,
		queryKey: ['inspections', 'visible', bbox, filters],
		queryFn: ({ signal }) => fetchVisibleInspections(bounds, filters, signal),
		placeholderData: (previous) => previous,
	});

	return { rows: query.data ?? [], isLoading: query.isLoading };
}

function useSelectedInspection(
	selectedId: string | null,
	visibleById: ReadonlyMap<string, InspectionSite>,
): InspectionSite | null {
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: ['inspections', 'detail', selectedId],
		queryFn: ({ signal }) => fetchInspectionById(selectedId ?? '', signal),
	});
	return needsFetch ? (query.data ?? null) : null;
}

async function fetchVisibleInspections(
	bounds: BoundingBox | null,
	filters: InspectionTileFilters,
	signal: AbortSignal,
): Promise<InspectionSite[]> {
	if (bounds === null) {
		return [];
	}
	const url = new URL('/map/inspections', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(normalizeBounds(bounds)));
	url.searchParams.set('limit', '50');
	if (filters.isWet !== undefined) {
		url.searchParams.set('isWet', String(filters.isWet));
	}
	if (filters.densities !== undefined && filters.densities.length > 0) {
		url.searchParams.set('density', [...filters.densities].join(','));
	}
	if (filters.positiveOnly === true) {
		url.searchParams.set('positive', 'true');
	}
	if (filters.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		url.searchParams.set('habitatTypeId', filters.habitatTypeIds.join(','));
	}
	if (filters.dateFrom !== undefined) {
		url.searchParams.set('dateFrom', filters.dateFrom);
	}
	if (filters.dateTo !== undefined) {
		url.searchParams.set('dateTo', filters.dateTo);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Inspections request failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly inspections?: InspectionSite[] };
	return body.inspections ?? [];
}

async function fetchInspectionById(
	id: string,
	signal: AbortSignal,
): Promise<InspectionSite | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`/map/inspections/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as { readonly inspection?: InspectionSite };
	return body.inspection ?? null;
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

function toggle<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
	const next = new Set(set);
	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}
	return next;
}

function resolveTypeName(
	inspection: InspectionSite,
	typeNameById: ReadonlyMap<string, string>,
): string {
	if (inspection.habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(inspection.habitatTypeId) ?? 'Unknown type';
}

function siteLabel(inspection: InspectionSite): string {
	return (
		inspection.habitatName?.trim() ||
		inspection.addressDisplayName?.trim() ||
		(inspection.habitatId === null
			? 'Ad-hoc inspection'
			: `Habitat ${inspection.habitatId.slice(0, 8)}`)
	);
}

function countLabel(value: number | null): string {
	return value == null ? '—' : value.toLocaleString();
}

function coordinateLabel(inspection: InspectionSite): string {
	if (inspection.lat == null || inspection.lng == null) {
		return 'Unknown';
	}
	return `${inspection.lat.toFixed(4)}, ${inspection.lng.toFixed(4)}`;
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
