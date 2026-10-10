import { addDaysToDateString } from '../../../lib/local-date';
import type { MapQueryValue } from '../../../lib/map-query-params';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
} from '../../../lib/search-filters';
import { defineRecordSet } from '../../explorer/record-set';
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

/** How many days the window opens on, ending on the Organization's today. */
export const OUTREACH_WINDOW_DAYS = 90;

/**
 * What an address with no filter params means: every outreach action over the
 * last ninety days, ending on the Organization's today.
 */
export function outreachFilterDefaults(today: string): OutreachFilters {
	return {
		from: addDaysToDateString(today, -(OUTREACH_WINDOW_DAYS - 1)),
		to: today,
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
 * The same filters as `/map/outreach` reads them. The Map adds the viewport's
 * `bbox` to these and the Table adds the whole world's, so the two surfaces
 * send one filter set under two boxes.
 */
export function outreachListParams(filters: OutreachTileFilters): Record<string, MapQueryValue> {
	return {
		outreachMethodId: filters.outreachMethodIds,
		technician: filters.technicianProfileIds,
		regionId: filters.regionIds,
		dateFrom: filters.dateFrom,
		dateTo: filters.dateTo,
	};
}

/**
 * The Outreach Actions Map and Table. Both read `/map/outreach` and apply every filter.
 */
export const outreachRecordSet = defineRecordSet({
	recordType: 'outreachAction',
	paths: { map: '/public-engagement/outreach', table: '/public-engagement/outreach/table' },
	codecs: outreachFilterCodecs,
	endpoint: { path: '/map/outreach', rowsKey: 'outreachActions' },
	tileFilters: outreachTileFilters,
	listParams: outreachListParams,
	defaults: ({ today }) => outreachFilterDefaults(today),
	counting: DATE_RANGE_COUNTING,
	applies: { from: 'both', to: 'both', people: 'both', methods: 'both', regions: 'both' },
});
