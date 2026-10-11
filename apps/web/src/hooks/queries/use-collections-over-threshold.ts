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
 * `collectedSince` from `collection-day.ts`. A collection with neither date is
 * still pending, and drops out on its own.
 *
 * A collection is windowed by when the trap was emptied, but its total only
 * exists once somebody keys it out. One emptied inside the window and identified
 * after it appears the day the counts land, and one identified 20 days after it
 * was collected never appears at all. That is the trade a panel about recent
 * field activity makes.
 */

import { and, eq, inArray, isNull, not, toArray, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { collection_methods } from '../../lib/collections/collection_methods';
import { collection_species } from '../../lib/collections/collection_species';
import { collections } from '../../lib/collections/collections';
import { traps } from '../../lib/collections/traps';
import type { LinkedAddress } from './address-view';
import { collectedSince, collectionEffectiveDate } from './collection-day';
import { compareByCollectionDateDesc } from './collection-view';
import { addressSelect, joinedOrNull, liveQueryGcTimeMs } from './shared';

/** One collection that reached its method's action threshold. */
export interface OverThresholdCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	/**
	 * Joined, not looked up. It is the rung below the Trap name on a collection
	 * recorded away from one (#1231); `address-view.ts` says why it is nested.
	 */
	readonly address: LinkedAddress;
	readonly latitude: number;
	readonly longitude: number;
	/**
	 * `null` only when the method is not in the client, which this list never
	 * holds: a collection is on it through its method's threshold, so the
	 * method row is always there. Typed the way the other adult reads type it.
	 */
	readonly methodName: string | null;
	/** The threshold it met or beat. Never null: a method without one is out. */
	readonly actionThreshold: number;
	/** Every species row on the collection summed: both sexes, any status. */
	readonly total: number;
	readonly collectedAt: Date | null;
	readonly collectionDate: string | null;
	/** The day it counts on, in the Organization's zone. See `collection-day.ts`. */
	readonly effectiveDate: string | null;
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
	// Eager, so this reads rows the app already holds. A retired method is left in:
	// it stops being offered on new collections, and the ones already made by it
	// still ran hot.
	const methodsWithThresholds = useLiveQuery((query) =>
		query
			.from({ method: collection_methods() })
			.where(({ method }) => not(isNull(method.action_threshold)))
			.select(({ method }) => ({ id: method.id })),
	);

	const methodIds = methodsWithThresholds.data.map((method) => method.id);

	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					and(
						inArray(collection.collection_method_id, methodIds),
						collectedSince(collection, sinceDate, timeZone),
					),
				)
				// `left`, not `inner`: a one-off collection names no trap, most name no
				// address, and an `inner` join would hide every one of them.
				.join({ trap: traps() }, ({ collection, trap }) => eq(collection.trap_id, trap.id), 'left')
				.join(
					{ address: addresses() },
					({ collection, address }) => eq(collection.address_id, address.id),
					'left',
				)
				.join(
					{ method: collection_methods() },
					({ collection, method }) => eq(collection.collection_method_id, method.id),
					'left',
				)
				.select(({ collection, trap, address, method }) => ({
					id: collection.id,
					address: addressSelect(address),
					latitude: collection.lat,
					longitude: collection.lng,
					trapId: collection.trap_id,
					trapName: joinedOrNull(trap.trap_name),
					trapCode: joinedOrNull(trap.trap_code),
					methodName: joinedOrNull(method.name),
					actionThreshold: joinedOrNull(method.action_threshold),
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
					species: toArray(
						query
							.from({ identification: collection_species() })
							.where(({ identification }) => eq(identification.collection_id, collection.id))
							.select(({ identification }) => ({ count: identification.count })),
					),
				})),
	});

	const rows = result.data;

	const over = rows
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
					address: row.address,
					latitude: row.latitude,
					longitude: row.longitude,
					trapId: row.trapId,
					trapName: row.trapName,
					trapCode: row.trapCode,
					methodName: row.methodName,
					actionThreshold: threshold,
					total,
					collectedAt: row.collectedAt,
					collectionDate: row.collectionDate,
					effectiveDate: collectionEffectiveDate(row, timeZone),
				},
			];
		})
		.sort(compareByCollectionDateDesc);

	return {
		collections: over,
		hasConfiguredThresholds: methodIds.length > 0,
		isReady: result.isReady && methodsWithThresholds.isReady,
		isError: result.isError || methodsWithThresholds.isError,
	};
}
