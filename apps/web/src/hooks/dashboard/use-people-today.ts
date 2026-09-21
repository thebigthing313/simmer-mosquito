/**
 * The Dashboard's "In the field today" table: everyone who logged field work
 * today, most records first, off the same day of synced rows the Activity
 * Monitor reads through `useDayActivity`. Takes today as `YYYY-MM-DD` in the
 * Organization's zone and the zone itself; the grouping is `peopleByRecords`.
 */

import { type PersonToday, peopleByRecords } from '../../components/dashboard/dashboard-data';
import { useDayActivity } from '../activity/use-day-activity';

export function usePeopleToday(
	today: string,
	timeZone: string,
): {
	readonly people: readonly PersonToday[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const day = useDayActivity(today, timeZone);
	return { people: peopleByRecords(day.entries), isReady: day.isReady, isError: day.isError };
}
