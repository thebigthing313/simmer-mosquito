import {
	choiceParam,
	choiceSetParam,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';

// The inspections explorer's URL filter contract. It lives outside the route
// module so the overview panels can build deep links into the explorer with a
// preset filter state, and the route can validate incoming params from the same
// definition. Every codec drops what it cannot read, so a malformed or
// hand-edited URL degrades to the explorer's own defaults instead of erroring.

export const inspectionDensityValues = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;
export type InspectionDensityValue = (typeof inspectionDensityValues)[number];

export const waterValues = ['all', 'wet', 'dry'] as const;
export type WaterFilterValue = (typeof waterValues)[number];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface InspectionFilters {
	/** Inclusive start of the inspection-date window (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the inspection-date window (`YYYY-MM-DD`). */
	readonly to: string;
	readonly water: WaterFilterValue;
	readonly density: ReadonlySet<InspectionDensityValue>;
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
	density: choiceSetParam(inspectionDensityValues),
	positive: flagParam,
	types: idSetParam,
	inspectors: idSetParam,
	regions: idSetParam,
};

/**
 * The encoded shape, as a deep link supplies it. A type alias rather than an
 * interface so it carries an implicit index signature and satisfies the router's
 * search type.
 */
export type InspectionsSearch = {
	readonly from?: string;
	readonly to?: string;
	readonly water?: WaterFilterValue;
	readonly density?: readonly InspectionDensityValue[];
	readonly positive?: boolean;
	readonly types?: readonly string[];
	readonly inspectors?: readonly string[];
	readonly regions?: readonly string[];
};
