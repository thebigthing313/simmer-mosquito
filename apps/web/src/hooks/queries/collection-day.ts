/**
 * Which day an Adult Collection counts on, the one place `apps/web` answers it.
 *
 * Not a hook, so not a `use-` file. Every collection read hook reduces its rows
 * through {@link collectionEffectiveDate} and windows its query through
 * {@link collectedSince}, and hands the day up as `effectiveDate`, so a page
 * reads the day rather than working it out. The one exception is the
 * collections explorer and its table, which read `CollectionListRow` off
 * `/map/collections` rather than through a hook and call the day function
 * themselves.
 *
 * ## The rule
 *
 * A collection is dated one of two ways, per an Organization setting.
 * `exact_timestamps` keeps an instant in `collected_at` and leaves
 * `collection_date` null; `collection_date_duration` keeps a plain day in
 * `collection_date` and leaves `collected_at` null. The `collections_timing_shape`
 * CHECK holds a row to one or the other, so the day is whichever column the mode
 * filled, with the instant read in the Organization's zone. That is
 * `collectionEffectiveDateExpr` in `packages/db`, which the overview, dashboard
 * and map reads share, and this module is the client half that has to agree
 * with it.
 *
 * The zone is an argument, not a column, so no compiled `select` can reduce the
 * instant: taking its UTC prefix would file a trap emptied at 10:30pm in a zone
 * west of UTC under the next day. The query predicates instead compare each
 * column against a bound in its own type, an instant against `collected_at` and
 * a day against `collection_date`, which is what lets both push down.
 */

import type { AdultCollection } from '@simmer-mosquito/sync';
import { and, eq, gte, type IR, lt, or, type Ref } from '@tanstack/react-db';
import { addCalendarDays, localDayStartAsInstant, todayInTimeZone } from '../../lib/local-date';
import type { CollectionDates } from './collection-view';

/**
 * The calendar day a collection is filed under, `YYYY-MM-DD`, or null when it
 * is pending or undated.
 *
 * `collectedAt` arrives as a `Date` off the synced table and as an ISO string
 * off `/map/collections`, whose `CollectionListRow` no read hook shapes.
 */
export function collectionEffectiveDate(
	collection: CollectionDates,
	timeZone: string,
): string | null {
	const { collectedAt, collectionDate } = collection;
	if (collectedAt === null) {
		return collectionDate === null ? null : collectionDate.slice(0, 10);
	}
	const instant = collectedAt instanceof Date ? collectedAt : new Date(collectedAt);
	if (!Number.isNaN(instant.getTime())) {
		return todayInTimeZone(timeZone, instant);
	}
	// An unparseable string still carries its leading date, so it is worth reading;
	// an invalid `Date` carries nothing, and guessing would be worse than a blank.
	return typeof collectedAt === 'string' ? collectedAt.slice(0, 10) : null;
}

/**
 * The collections ref as a query hands it to a predicate, off the table itself
 * or off a join over it.
 */
type CollectionRef = Ref<AdultCollection, boolean>;

/**
 * Collections whose day is `since` or later, for a `where`.
 *
 * A pending collection has neither column, and a comparison against null is
 * never true, so it drops out. A surface that lists pending rows adds its own
 * disjunct for them.
 */
export function collectedSince(
	collection: CollectionRef,
	since: string,
	timeZone: string,
): IR.BasicExpression<boolean> {
	return or(
		gte(collection.collected_at, localDayStartAsInstant(since, timeZone)),
		gte(collection.collection_date, since),
	);
}

/**
 * Collections whose day is `day`, for a `where`: an instant from that day's
 * start up to the next day's start in the Organization's zone, or a
 * `collection_date` equal to it.
 */
export function collectedOn(
	collection: CollectionRef,
	day: string,
	timeZone: string,
): IR.BasicExpression<boolean> {
	return or(
		and(
			gte(collection.collected_at, localDayStartAsInstant(day, timeZone)),
			lt(collection.collected_at, localDayStartAsInstant(addCalendarDays(day, 1), timeZone)),
		),
		eq(collection.collection_date, day),
	);
}
