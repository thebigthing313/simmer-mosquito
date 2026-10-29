import { OUTREACH_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
} from '../../../lib/search-filters';
import {
	defineRecordSet,
	type RecordSetWindowBounds,
	TABLE_OPENS_ON_ALL_TIME,
} from '../../explorer/record-set';
import { whenAny, whenText } from '../../explorer/tile-filter-params';
import type { OutreachTileFilters } from '../../map';

// The outreach actions URL filter contract, outside the route modules so the
// Map and the Table read the same params. Every codec drops what it cannot
// read, so a malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface OutreachFilters {
	/** Inclusive start of the window on the outreach date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the outreach date (`YYYY-MM-DD`). */
	readonly to: string;
	/** The technicians, by Profile id. */
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
}

export const outreachFilterCodecs: FilterCodecs<OutreachFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	regions: idSetParam,
};

/**
 * What an address with no filter params means: every outreach action inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function outreachFilterDefaults(window: RecordSetWindowBounds): OutreachFilters {
	return {
		from: window.from,
		to: window.to,
		people: new Set(),
		methods: new Set(),
		regions: new Set(),
	};
}

/** The filters as the outreach tile layer reads them. An unset filter is absent. */
export function outreachTileFilters(filters: OutreachFilters): OutreachTileFilters {
	return {
		...whenAny('outreachMethodIds', filters.methods),
		...whenAny('technicianProfileIds', filters.people),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The Outreach Actions Map and Table. Both read `/map/outreach` and apply every filter.
 */
export const outreachRecordSet = defineRecordSet({
	recordType: 'outreachAction',
	paths: { map: '/public-engagement/outreach', table: '/public-engagement/outreach/table' },
	codecs: outreachFilterCodecs,
	endpoint: {
		path: '/map/outreach',
		rowsKey: 'outreachActions',
		rowKey: 'outreachAction',
	},
	tileset: 'outreach',
	tileFilters: outreachTileFilters,
	filterSpec: OUTREACH_MAP_FILTERS,
	defaults: ({ window }) => outreachFilterDefaults(window),
	windows: {
		map: { kind: 'lastDays', days: 90, reason: 'Ninety days is one season of outreach.' },
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: { from: 'both', to: 'both', people: 'both', methods: 'both', regions: 'both' },
});
