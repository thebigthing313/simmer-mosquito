import type { MapQueryValue } from '../../hooks/explorer/use-paged-map-resource';
import { addDaysToDateString } from '../../lib/local-date';
import {
	choiceParam,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';
import { whenAny, whenOn, whenText } from '../explorer/tile-filter-params';
import type { SampleTileFilters } from '../map';

// The samples explorer's URL filter contract, outside the route module so
// overview panels can build deep links from the same definition. Every codec
// drops what it cannot read, so a malformed URL degrades to the explorer's
// defaults.

/** Sample lifecycle states the explorer can filter to; mirrors the server enum. */
const sampleStatusValues = [
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
	/** Restrict to samples whose parent inspection sits inside these regions. */
	readonly regions: ReadonlySet<string>;
}

export const sampleFilterCodecs: FilterCodecs<SampleFilters> = {
	from: dateParam,
	to: dateParam,
	status: choiceParam(sampleStatusValues, 'all'),
	species: idSetParam,
	nonMosquito: flagParam,
	regions: idSetParam,
};

/** How many days the window opens on, ending on the Organization's today. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * What an address with no filter params means: every status over the last
 * thirty days of inspections, ending on the Organization's today.
 */
export function sampleFilterDefaults(today: string): SampleFilters {
	return {
		from: addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		to: today,
		status: 'all',
		species: new Set(),
		nonMosquito: false,
		regions: new Set(),
	};
}

/** The filters as the samples tile layer reads them. An unset filter is absent. */
export function sampleTileFilters(filters: SampleFilters): SampleTileFilters {
	return {
		...whenAny('speciesIds', filters.species),
		...(filters.status === 'all' ? {} : { status: filters.status }),
		...whenOn('nonMosquitoOnly', filters.nonMosquito),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The same filters as `/map/samples` reads them. The Map adds the viewport's
 * `bbox` to these and the Table adds the whole world's, so the two surfaces
 * send one filter set under two boxes.
 */
export function sampleListParams(filters: SampleTileFilters): Record<string, MapQueryValue> {
	return {
		species: filters.speciesIds,
		status: filters.status,
		nonMosquito: filters.nonMosquitoOnly,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	};
}

/**
 * The params a move between the Map and the Table carries. That is every
 * filter, since both surfaces read the same list endpoint and apply each one.
 */
export function sharedSampleSearch(search: Record<string, unknown>): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(sampleFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
