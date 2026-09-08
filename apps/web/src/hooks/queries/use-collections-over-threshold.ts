/**
 * Collections whose specimen total reached the action threshold on their method.
 *
 * `collection_methods.action_threshold` is the count at or above which
 * collections made that way warrant a response. This is the read that acts on
 * it: the adult overview's escalation panel, modelled on the larval overview's
 * heavy inspections.
 *
 * ## What is in the query and what is folded after
 *
 * `collections` is on-demand, so the window and "the method declares a
 * threshold" are predicates on the collection itself rather than filters over
 * the rows: they are what narrows the subset that loads. The threshold half is
 * an `inArray` over method ids rather than a null test on the joined method,
 * because a predicate on a joined column filters emitted rows and leaves the
 * on-demand shape as wide as it was. `collection_methods` is eager, so the ids
 * cost no request.
 *
 * The sum and the comparison are folded after. Not for want of a `sum()`
 * aggregate: grouping the query by collection would put the projection behind
 * an aggregate and there would be no per-collection row left to carry the trap
 * name, the method name and the two date columns.
 *
 * ## The window
 *
 * Each date column is compared against a bound in its own type, because the two
 * collection timing modes date a collection from different columns and a
 * comparison only means something against the one it belongs to. A collection
 * with neither date is still pending, and a comparison against null is never
 * true, so it drops out on its own.
 *
 * A collection is windowed by when the trap was emptied, but its total only
 * exists once somebody keys it out. One emptied inside the window and identified
 * after it appears the day the counts land, and one identified 20 days after it
 * was collected never appears at all. That is the trade a panel about recent
 * field activity makes.
 */

import {
	and,
	coalesce,
	eq,
	gte,
	inArray,
	isNull,
	not,
	or,
	toArray,
	useLiveQuery,
} from '@tanstack/react-db';
import { useMemo } from 'react';
import { collection_methods } from '../../lib/collections/collection_methods';
import { collection_species } from '../../lib/collections/collection_species';
import { collections } from '../../lib/collections/collections';
import { traps } from '../../lib/collections/traps';
import { localDayStartAsInstant } from '../../lib/local-date';
import { compareByCollectionDateDesc } from './collection-view';
import { activityGcTimeMs } from './shared';

/** One collection that reached its method's action threshold. */
export interface OverThresholdCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly methodName: string;
	/** The threshold it met or beat. Never null: a method without one is out. */
	readonly actionThreshold: number;
	/** Every species row on the collection summed: both sexes, any status. */
	readonly total: number;
	readonly collectedAt: Date | null;
	readonly collectionDate: string | null;
}

export function useCollectionsOverThreshold(
	sinceDate: string,
	timeZone: string,
): {
	readonly collections: readonly OverThresholdCollection[];
	/**
	 * Whether any method in the organization sets a threshold at all.
	 *
	 * An empty list means one of two things and the panel says which. Without
	 * this, "nothing tripped" and "nothing can trip" read the same, and the
	 * second one reads as good news.
	 */
	readonly hasConfiguredThresholds: boolean;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const sinceInstant = localDayStartAsInstant(sinceDate, timeZone);
	const sinceMs = sinceInstant.getTime();

	// Eager, so this reads rows the app already holds. A retired method is left in:
	// it stops being offered on new collections, and the ones already made by it
	// still ran hot.
	const methodsWithThresholds = useLiveQuery((query) =>
		query
			.from({ method: collection_methods() })
			.where(({ method }) => not(isNull(method.action_threshold)))
			.select(({ method }) => ({ id: method.id })),
	);

	const methodIds = useMemo(
		() => methodsWithThresholds.data.map((method) => method.id).sort(),
		[methodsWithThresholds.data],
	);
	// A dependency has to be comparable by value, and an array is not.
	const methodIdsKey = methodIds.join(',');

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ collection: collections() })
					.where(({ collection }) =>
						and(
							inArray(collection.collection_method_id, methodIds),
							or(
								gte(collection.collected_at, sinceInstant),
								gte(collection.collection_date, sinceDate),
							),
						),
					)
					// `left`, not `inner`: an ad-hoc collection names no trap, and an
					// `inner` join would hide every one of them.
					.join(
						{ trap: traps() },
						({ collection, trap }) => eq(collection.trap_id, trap.id),
						'left',
					)
					.join(
						{ method: collection_methods() },
						({ collection, method }) => eq(collection.collection_method_id, method.id),
						'left',
					)
					.select(({ collection, trap, method }) => ({
						id: collection.id,
						trapId: collection.trap_id,
						trapName: coalesce(trap.trap_name, null),
						trapCode: coalesce(trap.trap_code, null),
						// `coalesce` because an unmatched join yields `undefined` for every
						// field of the missing side, and the fold reads null.
						methodName: coalesce(method.name, 'Unknown method'),
						actionThreshold: coalesce(method.action_threshold, null),
						collectedAt: collection.collected_at,
						collectionDate: collection.collection_date,
						species: toArray(
							query
								.from({ identification: collection_species() })
								.where(({ identification }) => eq(identification.collection_id, collection.id))
								.select(({ identification }) => ({ count: identification.count })),
						),
					})),
		},
		[sinceDate, sinceMs, methodIdsKey],
	);

	const rows = result.data;

	const over = useMemo(
		() =>
			rows
				.flatMap((row) => {
					const threshold = row.actionThreshold;
					// Nothing to compare against without a threshold, and nothing to
					// compare with until somebody keys the collection out. A zero-result
					// collection and one still awaiting identification both land here,
					// whatever the threshold is set to.
					if (threshold === null || row.species.length === 0) {
						return [];
					}
					// Every species row: both sexes, any physiological status.
					const total = row.species.reduce((sum, entry) => sum + entry.count, 0);
					if (total < threshold) {
						return [];
					}
					return [
						{
							id: row.id,
							trapId: row.trapId,
							trapName: row.trapName,
							trapCode: row.trapCode,
							methodName: row.methodName,
							actionThreshold: threshold,
							total,
							collectedAt: row.collectedAt,
							collectionDate: row.collectionDate,
						},
					];
				})
				.sort(compareByCollectionDateDesc),
		[rows],
	);

	return {
		collections: over,
		hasConfiguredThresholds: methodIds.length > 0,
		isReady: result.isReady && methodsWithThresholds.isReady,
		isError: result.isError || methodsWithThresholds.isError,
	};
}
