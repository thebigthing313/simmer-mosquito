/**
 * The Dashboard's "collections with a problem" queue: how many in the last 14
 * days, and the effective date of the oldest.
 *
 * The one windowed queue, because `has_problem` never clears and an all-time
 * count would only grow. Both date columns are bounded in their own type, the
 * way `useCollectionsOverThreshold` writes it, so the subset is the pending
 * rows rather than every collection the Organization has written.
 *
 * The oldest is folded after rather than taken as `min` in the query: the
 * effective date is `collected_at` reduced to the Organization's day under
 * exact timestamps and `collection_date` under date-plus-duration, a `Date` and
 * a string, and a `min` over a mixed column is not a minimum.
 */

import { and, eq, gte, or, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../../lib/collections/collections';
import { addCalendarDays, localCalendarDay, localDayStartAsInstant } from '../../lib/local-date';
import { activityGcTimeMs, type ElectricQueue } from './shared';

/** The window, inclusive of today: today and the 13 days before it. */
const PROBLEM_COLLECTIONS_WINDOW_DAYS = 14;

export function useProblemCollectionsQueue(today: string, timeZone: string): ElectricQueue {
	const since = addCalendarDays(today, -(PROBLEM_COLLECTIONS_WINDOW_DAYS - 1));
	const sinceInstant = localDayStartAsInstant(since, timeZone);

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					and(
						eq(collection.has_problem, true),
						or(gte(collection.collected_at, sinceInstant), gte(collection.collection_date, since)),
					),
				)
				.select(({ collection }) => ({
					id: collection.id,
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
				})),
	});

	let oldest: string | null = null;
	for (const row of result.data) {
		const effective =
			row.collectedAt === null ? row.collectionDate : localCalendarDay(row.collectedAt, timeZone);
		if (effective !== null && effective !== '' && (oldest === null || effective < oldest)) {
			oldest = effective;
		}
	}

	return {
		count: result.data.length,
		oldest,
		isReady: result.isReady,
		isError: result.isError,
	};
}
