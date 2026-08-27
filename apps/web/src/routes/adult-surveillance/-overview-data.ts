/**
 * What the adult overview reads, beyond the query hooks themselves.
 *
 * The three data hooks moved to `hooks/queries` — `useRecentCollections`,
 * `useCollectionsAwaitingIdentification`, `useAdultSpeciesComposition`. What is
 * left is the window this domain reads by, and the date formatters the panels
 * share with larval surveillance.
 *
 * There is no adult server read endpoint (unlike larval's `/samples/awaiting`),
 * so every panel here resolves from synced collections: traps are an eager shape
 * while collections and collection_species are on-demand (`docs/sync.md`).
 */

// Pure date helpers are shared with the larval overview; re-exported here so the
// adult panels build day strips and windows from one implementation.
export {
	addDaysToDateString,
	formatDate,
	formatMonthDay,
	formatWeekdayDate,
	formatWeekdayMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent-window queries reach. */
export const ADULT_ACTIVITY_WINDOW_DAYS = 14;
