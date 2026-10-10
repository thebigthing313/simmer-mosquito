import { startOfYear } from '../../../lib/date-presets';
import {
	choiceParam,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
	textParam,
} from '../../../lib/search-filters';
import type { ServiceRequestStatusFilter } from './legend';

// The service requests explorer's URL filter contract, outside the route module
// so the Table can read the same params. Every codec drops what it cannot read,
// so a malformed URL degrades to the explorer's defaults.

const STATUS_VALUES: readonly ServiceRequestStatusFilter[] = ['all', 'open', 'closed'];

/** The explorer's filter state, keyed by the param each field appears under. */
export interface ServiceRequestFilters {
	readonly status: ServiceRequestStatusFilter;
	readonly search: string;
	readonly tags: ReadonlySet<string>;
	readonly regions: ReadonlySet<string>;
	/** Inclusive start of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly from: string;
	/** Inclusive end of the `request_date` window (`YYYY-MM-DD`), `''` for none. */
	readonly to: string;
	/**
	 * Overdue requests only. Read only while the Organization's threshold is on;
	 * with it off the flag narrows nothing and no control sets it.
	 */
	readonly overdue: boolean;
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
	overdue: flagParam,
};

/** The order the Map's rail and the Table page in. */
export type ServiceRequestRailOrder = 'newest' | 'oldest';

export interface ServiceRequestRailSearch {
	readonly order: ServiceRequestRailOrder;
}

/**
 * The order the Map's rail and the Table page in, apart from the filters because
 * it narrows nothing: it does not count as a filter, a reset leaves it alone, and
 * it does not travel between the two surfaces. Newest first stays out of the URL.
 */
export const serviceRequestRailOrderCodecs: FilterCodecs<ServiceRequestRailSearch> = {
	order: choiceParam(['newest', 'oldest'], 'newest'),
};

/** The order control's two choices, drawn by the Map's rail and the Table alike. */
export const SERVICE_REQUEST_ORDER_OPTIONS: readonly {
	readonly value: ServiceRequestRailOrder;
	readonly label: string;
}[] = [
	{ value: 'newest', label: 'Newest' },
	{ value: 'oldest', label: 'Oldest' },
];

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
		overdue: false,
	};
}

/**
 * The params a move between the Map and the Table carries: status, the date
 * window and Overdue, which both surfaces read. Search, Tags and Regions stay behind,
 * because the Table has no control for them: one it carried would either sit
 * unapplied, leaving rows on screen the filter says are gone, or narrow the rows
 * with nothing on screen to show it or clear it.
 */
const SHARED_KEYS = ['status', 'from', 'to', 'overdue'] as const;

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
