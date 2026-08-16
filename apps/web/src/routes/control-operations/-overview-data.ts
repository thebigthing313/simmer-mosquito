/**
 * What the control-operations overview reads, beyond the query hooks themselves.
 *
 * The data hooks moved to `hooks/queries` — `useControlActionsForDay`,
 * `useRecentSourceReductions`, `useRecentBiocontrolActions`,
 * `useInsecticideUsage`, `useControlCatalogCounts`. What is left is the windows
 * this domain reads by, and the date helpers the panels share with the
 * surveillance overviews.
 *
 * There is no control read/aggregate endpoint, so every panel resolves from
 * synced collections: the method catalogs sync eagerly while the performed
 * actions are on-demand shapes (`docs/sync.md`), which is why every action hook
 * bounds its window by date.
 */

// Pure date helpers are shared with the surveillance overviews; re-exported here
// so every domain builds its windows from one implementation.
export {
	addDaysToDateString,
	buildWeek,
	dayOfMonth,
	startOfWeek,
	todayInTimeZone,
	weekdayLabel,
} from '../larval-surveillance/-overview-data';

/** How far back the recent-activity panels reach. */
export const CONTROL_ACTIVITY_WINDOW_DAYS = 14;

/** The windows the insecticide usage summary offers, shortest first. */
export const USAGE_WINDOW_DAYS = [7, 30] as const;
export type UsageWindowDays = (typeof USAGE_WINDOW_DAYS)[number];
