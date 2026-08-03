import {
	choiceParam,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';

// The samples explorer's URL filter contract. It lives outside the route module
// so overview panels can build deep links into the explorer with a preset filter
// state, and the route can validate incoming params from the same definition.
// Every codec drops what it cannot read, so a malformed or hand-edited URL
// degrades to the explorer's own defaults instead of erroring.

/** Sample lifecycle states the explorer can filter to; mirrors the server enum. */
export const sampleStatusValues = [
	'all',
	'identified',
	'awaiting',
	'zero_larvae',
	'unidentifiable',
] as const;
export type SampleStatusValue = (typeof sampleStatusValues)[number];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface SampleFilters {
	/** Inclusive start of the parent-inspection date window (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the parent-inspection date window (`YYYY-MM-DD`). */
	readonly to: string;
	readonly status: SampleStatusValue;
	/** Species the sample must have an identified result for. */
	readonly species: ReadonlySet<string>;
	/** Restrict to samples flagged with non-mosquito material. */
	readonly nonMosquito: boolean;
}

export const sampleFilterCodecs: FilterCodecs<SampleFilters> = {
	from: dateParam,
	to: dateParam,
	status: choiceParam(sampleStatusValues, 'all'),
	species: idSetParam,
	nonMosquito: flagParam,
};

/**
 * The encoded shape, as a deep link supplies it. A type alias rather than an
 * interface so it carries an implicit index signature and satisfies the router's
 * search type.
 */
export type SamplesSearch = {
	readonly from?: string;
	readonly to?: string;
	readonly status?: SampleStatusValue;
	readonly species?: readonly string[];
	readonly nonMosquito?: boolean;
};
