import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import {
	choiceParam,
	choiceSetParam,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';

// The inspections explorer's URL filter contract, outside the route module so
// the overview panels can build deep links from the same definition. Every
// codec drops what it cannot read, so a malformed URL degrades to the
// explorer's defaults.

const waterValues = ['all', 'wet', 'dry'] as const;
export type WaterFilterValue = (typeof waterValues)[number];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface InspectionFilters {
	/** Inclusive start of the inspection-date window (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the inspection-date window (`YYYY-MM-DD`). */
	readonly to: string;
	readonly water: WaterFilterValue;
	readonly density: ReadonlySet<LarvalDensity>;
	/** Restrict to inspections where at least one life stage was found. */
	readonly positive: boolean;
	readonly types: ReadonlySet<string>;
	readonly inspectors: ReadonlySet<string>;
	/** Restrict to inspections inside these regions. */
	readonly regions: ReadonlySet<string>;
}

export const inspectionFilterCodecs: FilterCodecs<InspectionFilters> = {
	from: dateParam,
	to: dateParam,
	water: choiceParam(waterValues, 'all'),
	density: choiceSetParam(LARVAL_DENSITIES),
	positive: flagParam,
	types: idSetParam,
	inspectors: idSetParam,
	regions: idSetParam,
};

/**
 * The encoded shape, as a deep link supplies it. A type alias rather than an
 * interface so it carries an implicit index signature and satisfies the
 * router's search type.
 */
export type InspectionsSearch = {
	readonly from?: string;
	readonly to?: string;
	readonly water?: WaterFilterValue;
	readonly density?: readonly LarvalDensity[];
	readonly positive?: boolean;
	readonly types?: readonly string[];
	readonly inspectors?: readonly string[];
	readonly regions?: readonly string[];
};

/**
 * What a move between the two Inspections surfaces carries: the keys named
 * here and nothing else, because the Table's search adds its own sort and the
 * Map has nowhere to put one. It takes the surface's validated search, so a
 * filter at its default stays off the address bar and each surface keeps its
 * own opening window.
 */
export function sharedInspectionSearch(search: Record<string, unknown>): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(inspectionFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
