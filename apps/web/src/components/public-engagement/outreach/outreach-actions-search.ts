import type { MapQueryValue } from '../../../hooks/explorer/use-paged-map-resource';
import { addDaysToDateString } from '../../../lib/local-date';
import { dateParam, type FilterCodecs, idSetParam } from '../../../lib/search-filters';
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
 * The params a move between the Map and the Table carries. That is every
 * filter, since both surfaces read the same list endpoint and apply each one.
 */
export function sharedOutreachSearch(search: Record<string, unknown>): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(outreachFilterCodecs)) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
