/**
 * The Dashboard's "collections with a problem" queue: how many in the last 14
 * days, and the effective date of the oldest.
 */

import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../../lib/collections/collections';
import { addCalendarDays } from '../../lib/local-date';
import { collectedSince, collectionEffectiveDate } from './collection-day';
import { activityGcTimeMs, type ElectricQueue } from './shared';

/** The window, inclusive of today: today and the 13 days before it. */
const PROBLEM_COLLECTIONS_WINDOW_DAYS = 14;

export function useProblemCollectionsQueue(today: string, timeZone: string): ElectricQueue {
	const since = addCalendarDays(today, -(PROBLEM_COLLECTIONS_WINDOW_DAYS - 1));

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					and(eq(collection.has_problem, true), collectedSince(collection, since, timeZone)),
				)
				.select(({ collection }) => ({
					id: collection.id,
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
				})),
	});

	let oldest: string | null = null;
	for (const row of result.data) {
		const effective = collectionEffectiveDate(row, timeZone);
		if (effective !== null && (oldest === null || effective < oldest)) {
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
