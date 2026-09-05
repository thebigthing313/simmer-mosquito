/**
 * The inspection filters, shared by the map explorer and the table.
 *
 * Both surfaces answer questions about the same rows and both hold what the
 * reader narrowed to on the URL, through the codecs in `-inspections-search.ts`.
 * So the window they open on, the controls that set a filter, the chips that
 * undo one and the words on both are here rather than written out twice: a link
 * built on one surface opens the same set on the other because both read this,
 * not because two copies happen to agree.
 *
 * What is not here is layout. The explorer stacks its controls in a narrow panel
 * beside a map and the table lays them across a bar above rows, so each route
 * arranges the pieces itself.
 */

import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useCallback, useMemo } from 'react';
import {
	ActiveFilterBar,
	FilterChip,
	type FilterOption,
	toggle,
	useHabitatTypeOptions,
	usePersonnelOptions,
} from '../../components/explorer';
import { densityLabel } from '../../components/larval-display';
import { INSPECTION_DENSITY_COLORS } from '../../components/map';
import type { InspectionTableFilters } from '../../hooks/queries/use-inspection-table';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { type FilterCounting, useSearchFilters } from '../../lib/search-filters';
import {
	type InspectionFilters,
	inspectionFilterCodecs,
	type WaterFilterValue,
} from './-inspections-search';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from './-overview-data';

/** How far back the map opens, and what Clear all returns it to. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * How much of the record a surface opens on when the address names no dates.
 *
 * The two differ, and the difference is the surfaces rather than an oversight.
 * The map draws every matching record at once, so a season of inspections is a
 * solid block of dots over the same streets and it opens on the last 30 days.
 * The table shows 50 rows whatever the reach, and its header says it holds every
 * inspection the crews have recorded, so it opens on all of them. Once a reader
 * sets a date, both surfaces read it out of the same two params and answer the
 * same window.
 */
export type InspectionOpeningWindow = 'last-30-days' | 'all-time';

/** The Water control's segments, which are also what its chip reads by. */
export const WETNESS_OPTIONS: readonly {
	readonly value: WaterFilterValue;
	readonly label: string;
}[] = [
	{ value: 'all', label: 'All' },
	{ value: 'wet', label: 'Wet' },
	{ value: 'dry', label: 'Dry' },
];

/**
 * How the table counts what is set.
 *
 * `regions` is on the URL and no control on the table writes it, so it is
 * counted nowhere and drawn as no chip. It stays in the filter set so a link
 * that came from the map keeps its region selection through a trip to the table
 * and back, and Clear all still drops it.
 */
export const INSPECTION_TABLE_COUNTING: FilterCounting<InspectionFilters> = {
	groups: [['from', 'to']],
	uncounted: ['regions'],
};

/** What the reader has narrowed the inspections to. */
export interface InspectionFilterState {
	readonly dateFrom: string;
	readonly dateTo: string;
	readonly densities: ReadonlySet<LarvalDensity>;
	readonly inspectorIds: ReadonlySet<string>;
	readonly positiveOnly: boolean;
	readonly regionIds: ReadonlySet<string>;
	readonly typeIds: ReadonlySet<string>;
	readonly wetness: WaterFilterValue;
}

/** One setter per filter, each patching the URL. */
export interface InspectionFilterSetters {
	readonly setDensities: (next: ReadonlySet<LarvalDensity>) => void;
	readonly setInspectorIds: (next: ReadonlySet<string>) => void;
	readonly setPositiveOnly: (next: boolean) => void;
	readonly setRegionIds: (next: ReadonlySet<string>) => void;
	readonly setTypeIds: (next: ReadonlySet<string>) => void;
	readonly setWetness: (next: WaterFilterValue) => void;
}

/** The two catalogs both surfaces label a filtered row by. */
export interface InspectionCatalogs {
	readonly habitatTypes: readonly FilterOption[];
	readonly personnel: readonly FilterOption[];
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly personnelNameById: ReadonlyMap<string, string>;
}

/**
 * What an address with no filter params means, and the Organization's today.
 *
 * The map's window is a fixed number of days back rather than a calendar month,
 * so it opens on the same amount of work whenever it is opened. `today` is
 * separate from the window because the date control needs it either way: it is
 * the upper bound on both pickers and what a preset counts back from.
 */
function useInspectionFilterDefaults(opening: InspectionOpeningWindow): {
	readonly defaults: InspectionFilters;
	readonly today: string;
} {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const defaults = useMemo<InspectionFilters>(
		() => ({
			from: opening === 'all-time' ? '' : addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
			to: opening === 'all-time' ? '' : today,
			water: 'all',
			density: new Set<LarvalDensity>(),
			positive: false,
			types: new Set<string>(),
			inspectors: new Set<string>(),
			regions: new Set<string>(),
		}),
		[opening, today],
	);
	return { defaults, today };
}

/** Everything a surface needs to read and write the filter set. */
export interface InspectionFilterBinding {
	readonly activeCount: number;
	readonly defaults: InspectionFilters;
	/** Drop every filter param, back to {@link useInspectionFilterDefaults}. */
	readonly reset: () => void;
	readonly set: InspectionFilterSetters;
	/** The raw patch function, for the date range control's two bounds. */
	readonly setFilters: (patch: Partial<InspectionFilters>) => void;
	readonly state: InspectionFilterState;
	/** Today in the Organization's zone, which bounds the date pickers. */
	readonly today: string;
}

/**
 * The filter set, held on the URL.
 *
 * A deep link from an overview panel, a shared link, and Back out of a record
 * all land on the same view, so the state cannot live in a component. What a
 * component wants back is a plain value and a setter per filter, and building
 * those out of one patch function is the bulk of what either route would
 * otherwise do before it renders anything.
 *
 * `state` and `set` are memoized rather than rebuilt per render, so a caller can
 * derive a query from them and have the derivation hold still.
 */
export function useInspectionFilterState(
	counting: FilterCounting<InspectionFilters>,
	opening: InspectionOpeningWindow,
): InspectionFilterBinding {
	const { defaults, today } = useInspectionFilterDefaults(opening);
	const {
		filters: query,
		setFilters,
		reset,
		activeCount,
	} = useSearchFilters(defaults, inspectionFilterCodecs, counting);

	const setWetness = useCallback(
		(next: WaterFilterValue) => setFilters({ water: next }),
		[setFilters],
	);
	const setDensities = useCallback(
		(next: ReadonlySet<LarvalDensity>) => setFilters({ density: next }),
		[setFilters],
	);
	const setPositiveOnly = useCallback(
		(next: boolean) => setFilters({ positive: next }),
		[setFilters],
	);
	const setTypeIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ types: next }),
		[setFilters],
	);
	const setInspectorIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ inspectors: next }),
		[setFilters],
	);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);

	const state = useMemo<InspectionFilterState>(
		() => ({
			dateFrom: query.from,
			dateTo: query.to,
			densities: query.density,
			inspectorIds: query.inspectors,
			positiveOnly: query.positive,
			regionIds: query.regions,
			typeIds: query.types,
			wetness: query.water,
		}),
		[query],
	);
	const set = useMemo<InspectionFilterSetters>(
		() => ({
			setDensities,
			setInspectorIds,
			setPositiveOnly,
			setRegionIds,
			setTypeIds,
			setWetness,
		}),
		[setDensities, setInspectorIds, setPositiveOnly, setRegionIds, setTypeIds, setWetness],
	);

	return { activeCount, defaults, reset, set, setFilters, state, today };
}

/**
 * The filter set as the table's read wants it: one field per column.
 *
 * Region is dropped here rather than forgotten. The table has no region
 * predicate to give it to, and {@link InspectionTableFilters} says why.
 */
export function inspectionTableFilters(state: InspectionFilterState): InspectionTableFilters {
	return {
		dateFrom: state.dateFrom,
		dateTo: state.dateTo,
		isWet: state.wetness === 'all' ? null : state.wetness === 'wet',
		densities: state.densities,
		larvaeFound: state.positiveOnly,
		habitatTypeIds: state.typeIds,
		inspectedByProfileIds: state.inspectorIds,
	};
}

/** The two eager catalogs a filtered row is labelled from. */
export function useInspectionCatalogs(): InspectionCatalogs {
	const habitatTypes = useHabitatTypeOptions();
	const personnel = usePersonnelOptions();
	return useMemo(
		() => ({
			habitatTypes: habitatTypes.options,
			personnel: personnel.options,
			typeNameById: habitatTypes.nameById,
			personnelNameById: personnel.nameById,
		}),
		[habitatTypes, personnel],
	);
}

/**
 * Larval density as a chip row, each chip carrying the heat colour it maps to on
 * the map, so the filter doubles as the map's key.
 *
 * The bands come from `LARVAL_DENSITIES`, which is the register
 * `check:column-vocabularies` holds the `larval_density` type to. Their order is
 * part of that contract, so the row reads `none` through `very_heavy` here, in
 * the legend and on the ramp.
 */
export function DensityFilter({
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
				{LARVAL_DENSITIES.map((value) => {
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

/**
 * The chips for the filters both surfaces carry, and Clear all.
 *
 * A surface with a filter of its own passes its chips as children, which puts
 * them after these and before Clear all. The map does that with Region.
 */
export function InspectionFilterChips({
	catalogs,
	children,
	defaults,
	onClearAll,
	onResetDates,
	set,
	state,
}: {
	readonly catalogs: InspectionCatalogs;
	readonly children?: ReactNode;
	readonly defaults: InspectionFilters;
	readonly onClearAll: () => void;
	readonly onResetDates: () => void;
	readonly set: InspectionFilterSetters;
	readonly state: InspectionFilterState;
}) {
	const { densities, inspectorIds, typeIds, wetness } = state;
	const isDefaultRange = state.dateFrom === defaults.from && state.dateTo === defaults.to;
	return (
		<ActiveFilterBar onClearAll={onClearAll}>
			{isDefaultRange ? null : (
				<FilterChip
					label={`Dates: ${dateRangeLabel(state.dateFrom, state.dateTo)}`}
					onRemove={onResetDates}
				/>
			)}
			{wetness === 'all' ? null : (
				<FilterChip
					label={`Water: ${wetness === 'wet' ? 'Wet' : 'Dry'}`}
					onRemove={() => set.setWetness('all')}
				/>
			)}
			{LARVAL_DENSITIES.filter((value) => densities.has(value)).map((value) => (
				<FilterChip
					color={INSPECTION_DENSITY_COLORS[value]}
					key={`density-${value}`}
					label={densityLabel(value)}
					onRemove={() => set.setDensities(toggle(densities, value))}
				/>
			))}
			{state.positiveOnly ? (
				<FilterChip label="Larvae found" onRemove={() => set.setPositiveOnly(false)} />
			) : null}
			{[...typeIds].map((id) => (
				<FilterChip
					key={`type-${id}`}
					label={catalogs.typeNameById.get(id) ?? 'Unknown type'}
					onRemove={() => set.setTypeIds(toggle(typeIds, id))}
				/>
			))}
			{[...inspectorIds].map((id) => (
				<FilterChip
					key={`inspector-${id}`}
					label={catalogs.personnelNameById.get(id) ?? 'Unknown inspector'}
					onRemove={() => set.setInspectorIds(toggle(inspectorIds, id))}
				/>
			))}
			{children}
		</ActiveFilterBar>
	);
}

/** The active range chip's words, with either bound possibly open. */
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
