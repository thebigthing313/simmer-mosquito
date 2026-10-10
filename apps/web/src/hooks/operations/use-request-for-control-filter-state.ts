import { addCalendarDays, todayInTimeZone } from '../../lib/local-date';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterBinding,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** Which requests the status filter can keep, in the order its segments draw. */
const REQUEST_STATUS_FILTERS = ['all', 'open', 'resolved'] as const;

/** Which requests the status filter keeps. */
export type RequestStatusFilter = (typeof REQUEST_STATUS_FILTERS)[number];

/** The Requests for Control filter state, keyed by the param each field appears under. */
export interface RequestFilters {
	/** Inclusive start of the window on the requested date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the requested date (`YYYY-MM-DD`). */
	readonly to: string;
	readonly status: RequestStatusFilter;
	/** The control types, by code. */
	readonly types: ReadonlySet<string>;
	/** The requesters, by Profile id. */
	readonly people: ReadonlySet<string>;
	/** Only requests no live stop on a scheduled or in-progress mission names. */
	readonly unassigned: boolean;
}

// `open` is the default and so stays out of the URL: the queue is read to find
// work that still needs doing, and a link that carries no status should land on
// that rather than on everything ever raised.
export const requestFilterCodecs: FilterCodecs<RequestFilters> = {
	from: dateParam,
	to: dateParam,
	status: choiceParam(REQUEST_STATUS_FILTERS, 'open'),
	types: idSetParam,
	people: idSetParam,
	unassigned: flagParam,
};

// A request queue is read backwards from today: the default window is the last
// quarter, long enough that an unresolved request raised weeks ago is still in
// view without the operator touching a filter.
const DEFAULT_WINDOW_DAYS = 90;

/**
 * What an address with no filter params means: the open requests raised over
 * the last ninety days, ending on the Organization's today.
 */
export function requestFilterDefaults(today: string): RequestFilters {
	return {
		from: addCalendarDays(today, -(DEFAULT_WINDOW_DAYS - 1)),
		to: today,
		status: 'open',
		types: new Set(),
		people: new Set(),
		unassigned: false,
	};
}

/**
 * The filters the Requests for Control index reads, held on the URL through
 * `requestFilterCodecs`. A window moved off the last ninety days counts as one
 * active filter, and so does a status other than `open`.
 */
export function useRequestForControlFilterState(): FilterBinding<RequestFilters> {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = requestFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		requestFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
