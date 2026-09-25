/**
 * Adult collections retrieved in a recent window, newest first.
 *
 * The overview's activity list and its flagged-for-attention panel, which read
 * the same window and differ only in what they keep.
 *
 * ## What this replaces
 *
 * The overview built three lookup maps — every trap, every method, every profile
 * — and threaded them down through the panels so each row could name itself. The
 * three names are joined now, so a row arrives able to say what it is. The maps
 * were whole-table reads for three labels a row already points at.
 *
 * ## The window
 *
 * Each date column is compared against a bound in its own type, because the two
 * collection timing modes date a collection from different columns and a
 * comparison only means something against the one it belongs to. A collection
 * with neither date is genuinely pending and drops out on its own — a comparison
 * against null is never true — which is right here and wrong in the trap
 * directory, where "still out" is a bucket worth showing.
 */

import { coalesce, eq, gte, or, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { collection_methods } from '../../lib/collections/collection_methods';
import { collections } from '../../lib/collections/collections';
import { profiles } from '../../lib/collections/profiles';
import { traps } from '../../lib/collections/traps';
import { localDayStartAsInstant } from '../../lib/local-date';
import type { LinkedAddress } from './address-view';
import { compareByCollectionDateDesc } from './collection-view';
import { activityGcTimeMs, addressSelect } from './shared';

/** One collection as the overview lists it. */
export interface ActivityCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly methodId: string;
	readonly methodName: string;
	readonly addressId: string | null;
	/**
	 * Joined, not looked up. It is the rung below the Trap name on a collection
	 * recorded away from one (#1231); `address-view.ts` says why it is nested.
	 */
	readonly address: LinkedAddress;
	readonly latitude: number;
	readonly longitude: number;
	readonly collectedAt: Date | null;
	readonly collectionDate: string | null;
	readonly collectionTimingMode: string;
	readonly collectedByProfileId: string | null;
	/** Who emptied the trap. `null` when nobody was recorded. */
	readonly collectedByName: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
}

export function useRecentCollections(
	sinceDate: string,
	timeZone: string,
): {
	readonly collections: readonly ActivityCollection[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const sinceInstant = localDayStartAsInstant(sinceDate, timeZone);

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					or(
						gte(collection.collected_at, sinceInstant),
						gte(collection.collection_date, sinceDate),
					),
				)
				// `left` throughout: a one-off collection names no trap, most name no
				// address and nobody need have been recorded as collector.
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
				.join(
					{ collector: profiles() },
					({ collection, collector }) => eq(collection.collected_by_profile_id, collector.id),
					'left',
				)
				.select(({ collection, trap, address, method, collector }) => ({
					id: collection.id,
					address: addressSelect(address),
					trapId: collection.trap_id,
					trapName: coalesce(trap.trap_name, null),
					trapCode: coalesce(trap.trap_code, null),
					methodId: collection.collection_method_id,
					methodName: coalesce(method.name, 'Unknown method'),
					addressId: collection.address_id,
					latitude: collection.lat,
					longitude: collection.lng,
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
					collectionTimingMode: collection.collection_timing_mode,
					collectedByProfileId: collection.collected_by_profile_id,
					collectedByName: coalesce(collector.display_name, null),
					hasProblem: collection.has_problem,
					isZeroResult: collection.is_zero_result,
					hasBycatch: collection.has_bycatch,
				})),
	});

	const rows = result.data;
	// Sorted here rather than in the query — see `compareByCollectionDateDesc`.
	const sorted = [...rows].sort(compareByCollectionDateDesc);

	return { collections: sorted, isReady: result.isReady, isError: result.isError };
}
