import {
	choiceParam,
	dateParam,
	type FilterCodecs,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import { startOfYear } from '../../date-range-filter';
import type { StatusFilter } from './legend';

// The service requests explorer's URL filter contract, outside the route module
// so the Table can read the same params. Every codec drops what it cannot read,
// so a malformed URL degrades to the explorer's defaults.

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'open', 'closed'];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface ServiceRequestFilters {
	readonly status: StatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
	/** Inclusive start of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly from: string;
	/** Inclusive end of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly to: string;
}

/**
 * The window opens on this year, so `from` and `to` take `dateParam`: an absent
 * param means this year, and All time has to be spelled `any` or a reload
 * would narrow it back.
 */
export const serviceRequestFilterCodecs: FilterCodecs<ServiceRequestFilters> = {
	status: choiceParam(STATUS_VALUES, 'all'),
	search: textParam,
	tags: idSetParam,
	regions: idSetParam,
	from: dateParam,
	to: dateParam,
};

/** The order the Map's rail pages in. */
export type ServiceRequestRailOrder = 'newest' | 'oldest';

export interface ServiceRequestRailSearch {
	readonly order: ServiceRequestRailOrder;
}

/**
 * The rail's order, apart from the filters because it narrows nothing: it does
 * not count as a filter, a reset leaves it alone, and it does not travel to the
 * Table, which has its own sort. Newest first stays out of the URL.
 */
export const serviceRequestRailOrderCodecs: FilterCodecs<ServiceRequestRailSearch> = {
	order: choiceParam(['newest', 'oldest'], 'newest'),
};

/**
 * What an address with no filter params means: every status, from the first of
 * January through the Organization's today.
 */
export function serviceRequestFilterDefaults(today: string): ServiceRequestFilters {
	return {
		status: 'all',
		search: '',
		tags: new Set<string>(),
		regions: new Set<string>(),
		from: startOfYear(today),
		to: today,
	};
}

/**
 * The params a move between the Map and the Table carries: status and the date
 * window, which both surfaces read. Search, Tags and Regions stay behind,
 * because the Table cannot apply them and a param it carried without applying
 * would leave rows on screen that the filter says are gone.
 * `ServiceRequestTableFilters` says why.
 */
const SHARED_KEYS = ['status', 'from', 'to'] as const;

export function sharedServiceRequestSearch(
	search: Record<string, unknown>,
): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of SHARED_KEYS) {
		const value = search[key];
		if (value !== undefined) {
			carried[key] = value;
		}
	}
	return carried;
}
