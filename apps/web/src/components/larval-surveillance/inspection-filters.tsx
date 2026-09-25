/**
 * The inspection filters, shared by the map explorer and the table. Both hold
 * what the reader narrowed to on the URL through the codecs in
 * `inspections-search.ts`, so the window, the controls, the chips and the
 * words are here rather than written out twice. Layout is each route's own.
 */

import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import type { InspectionTableFilters } from '../../hooks/queries/use-inspection-table';
import { dateRangeLabel } from '../../lib/local-date';
import type { FilterCounting } from '../../lib/search-filters';
import { ActiveFilterBar, FilterChip, type FilterOption, toggle } from '../explorer';
import { densityLabel } from '../larval-display';
import { INSPECTION_DENSITY_COLORS } from '../map';
import type { InspectionFilters, WaterFilterValue } from './inspections-search';

/**
 * How much of the record a surface opens on when the address names no dates.
 * The map opens on the last 30 days, because a season of inspections is a
 * solid block of dots; the table shows 50 rows whatever the reach, so it opens
 * on all of them.
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
 * How the table counts what is set. `regions` is on the URL and no control on
 * the table writes it, so it is counted nowhere and drawn as no chip, but it
 * stays in the filter set so a link from the map keeps its region selection.
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
 * The filter set as the table's read wants it: one field per column. Region is
 * dropped; {@link InspectionTableFilters} says why.
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

/**
 * Larval density as a chip row, each chip carrying the heat colour it maps to
 * on the map, so the filter doubles as the map's key. The bands and their
 * order come from `LARVAL_DENSITIES`.
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
								'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
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
 * The chips for the filters both surfaces carry, and Clear all. A surface with
 * a filter of its own passes its chips as children.
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
