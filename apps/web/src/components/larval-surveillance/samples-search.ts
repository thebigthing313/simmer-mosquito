import { SAMPLE_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';
import {
	defineRecordSet,
	type RecordSetWindowBounds,
	TABLE_OPENS_ON_ALL_TIME,
} from '../explorer/record-set';
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

/**
 * What an address with no filter params means: every status inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function sampleFilterDefaults(window: RecordSetWindowBounds): SampleFilters {
	return {
		from: window.from,
		to: window.to,
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
 * The Samples Map and Table. Both read `/map/samples` and apply every filter.
 */
export const sampleRecordSet = defineRecordSet({
	recordType: 'sample',
	paths: { map: '/larval-surveillance/samples', table: '/larval-surveillance/samples/table' },
	codecs: sampleFilterCodecs,
	endpoint: { path: '/map/samples', rowsKey: 'samples', rowKey: 'sample' },
	tileset: 'samples',
	tileFilters: sampleTileFilters,
	filterSpec: SAMPLE_MAP_FILTERS,
	defaults: ({ window }) => sampleFilterDefaults(window),
	windows: {
		map: { kind: 'lastDays', days: 30, reason: 'A season of samples fills the Map solid.' },
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: {
		from: 'both',
		to: 'both',
		status: 'both',
		species: 'both',
		nonMosquito: 'both',
		regions: 'both',
	},
});
