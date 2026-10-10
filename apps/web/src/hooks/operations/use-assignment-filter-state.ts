import { datePresetRange, SCHEDULE_WINDOW } from '../../lib/date-presets';
import { todayInTimeZone } from '../../lib/local-date';
import {
	choiceSetParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
} from '../../lib/search-filters';
import { ASSIGNMENT_STATUSES, type AssignmentStatus } from '../queries/assignment-view';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The Assignments filter state, keyed by the param each field appears under. */
export interface AssignmentFilters {
	/** Inclusive start of the window on the assignment date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the assignment date (`YYYY-MM-DD`). */
	readonly to: string;
	/** The assignees, by Profile id or `unassigned`. */
	readonly people: ReadonlySet<string>;
	readonly statuses: ReadonlySet<AssignmentStatus>;
}

export const assignmentFilterCodecs: FilterCodecs<AssignmentFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	statuses: choiceSetParam(ASSIGNMENT_STATUSES),
};

/**
 * What an address with no filter params means: every assignment dated in the
 * schedule window around the Organization's today. An assignment list is a
 * schedule, not a history, so it opens on that window rather than on the last
 * few months.
 */
function assignmentFilterDefaults(today: string): AssignmentFilters {
	const range = datePresetRange(SCHEDULE_WINDOW, today);
	return {
		from: range.from,
		to: range.to,
		people: new Set(),
		statuses: new Set(),
	};
}

/** The Assignments filter set on the URL, and what it resets to. */
export interface AssignmentFilterBinding {
	readonly filters: AssignmentFilters;
	readonly setFilters: (patch: Partial<AssignmentFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	readonly defaults: AssignmentFilters;
	/** The Organization's today, which the schedule window is measured from. */
	readonly today: string;
}

/**
 * The filters the Assignments index reads, held on the URL through
 * `assignmentFilterCodecs`. A window moved off the schedule window counts as
 * one active filter.
 */
export function useAssignmentFilterState(): AssignmentFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = assignmentFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		assignmentFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
