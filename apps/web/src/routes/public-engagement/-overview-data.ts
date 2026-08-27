/**
 * What the public-engagement overview reads, beyond the query hooks themselves.
 *
 * The data hooks moved to `hooks/queries` — `useOrganizationServiceRequests`,
 * `useServiceRequestFeed`, `useRecentOutreachActions`. What is left is the
 * windows this domain reads by, and the date helpers the panels share with the
 * surveillance overviews.
 *
 * There is no public-engagement read endpoint, so every panel resolves from
 * synced collections: `service_requests` and `outreach_actions` are on-demand
 * shapes (`docs/sync.md`), which is why the outreach hook bounds its window by
 * date and the request hook leans on the server-scoped shape.
 */

// Pure date helpers are shared with the surveillance overviews; re-exported here
// so every domain builds its windows from one implementation.
export {
	addDaysToDateString,
	formatMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent outreach panel reaches. */
export const OUTREACH_ACTIVITY_WINDOW_DAYS = 14;
/** How far back the service request activity feed reaches. */
export const SERVICE_REQUEST_FEED_WINDOW_DAYS = 7;
