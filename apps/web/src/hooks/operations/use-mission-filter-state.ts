import { datePresetRange, SCHEDULE_WINDOW } from '../../lib/date-presets';
import { todayInTimeZone } from '../../lib/local-date';
import {
	choiceSetParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterBinding,
	type FilterCodecs,
	idSetParam,
} from '../../lib/search-filters';
import { MISSION_STATUSES, type MissionStatus } from '../queries/operations-view';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The Missions filter state, keyed by the param each field appears under. */
export interface MissionFilters {
	/** Inclusive start of the window on the scheduled start (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the scheduled start (`YYYY-MM-DD`). */
	readonly to: string;
	readonly statuses: ReadonlySet<MissionStatus>;
	/** The control types, by code. */
	readonly types: ReadonlySet<string>;
	/** The assignees, by Profile id or `unassigned`. */
	readonly people: ReadonlySet<string>;
}

export const missionFilterCodecs: FilterCodecs<MissionFilters> = {
	from: dateParam,
	to: dateParam,
	statuses: choiceSetParam(MISSION_STATUSES),
	types: idSetParam,
	people: idSetParam,
};

/**
 * What an address with no filter params means: every mission scheduled to
 * start in the schedule window around the Organization's today. A mission list
 * is a schedule, not a history, so it opens on that window rather than on the
 * last few months.
 */
function missionFilterDefaults(today: string): MissionFilters {
	const range = datePresetRange(SCHEDULE_WINDOW, today);
	return {
		from: range.from,
		to: range.to,
		statuses: new Set(),
		types: new Set(),
		people: new Set(),
	};
}

/**
 * The filters the Missions index reads, held on the URL through
 * `missionFilterCodecs`. A window moved off the schedule window counts as one
 * active filter.
 */
export function useMissionFilterState(): FilterBinding<MissionFilters> {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = missionFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		missionFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
