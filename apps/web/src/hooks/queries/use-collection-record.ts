/**
 * One Adult Collection, as its own edit form reads it.
 *
 * The counterpart of `use-habitat-record.ts` and `use-inspection-record.ts`, and
 * here for the same reason: `use-adult-collection.ts` joins the trap, the
 * method, the lure and the address so a card can name them, and every one of
 * those is a join a form does not need — it writes ids. It also coalesces the
 * method name to `Unknown method`, which is right on a card and wrong in a
 * field.
 *
 * `trapId` decides which kind of collection this is — an ad hoc one owns its
 * point and its address, a trap one inherits both — so it is here even though
 * the form locks that choice rather than offering it.
 *
 * `collections` is on-demand, so this uses the status-gated `useLiveQuery`
 * rather than the suspense variant, which sticks after a navigation unmount over
 * an on-demand collection.
 */

import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../../lib/collections/collections';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** An Adult Collection as its edit form holds one. */
export interface CollectionRecord {
	readonly id: string;
	readonly organizationId: string;
	/** `null` on an ad hoc collection, which is what makes it one. */
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	/** Ad hoc only — a trap collection takes the trap's. */
	readonly addressId: string | null;
	readonly collectionTimingMode: AdultCollectionTimingMode;
	/** Exact mode: when the trap went out. */
	readonly startedAt: Date | null;
	/** Exact mode: when it was emptied. `null` on a trap still out. */
	readonly collectedAt: Date | null;
	/** Date+duration mode: the day it is filed under, `YYYY-MM-DD`. */
	readonly collectionDate: string | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	readonly hasProblem: boolean;
	readonly metadata: unknown;
	/** Where an ad hoc collection's point sits, for the map the form draws. */
	readonly latitude: number;
	readonly longitude: number;
}

export function useCollectionRecord(collectionId: string | null | undefined): {
	readonly collection: CollectionRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = collectionId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ collection: collections() })
					.where(({ collection }) => eq(collection.id, id))
					.select(({ collection }) => ({
						id: collection.id,
						organizationId: collection.organization_id,
						trapId: collection.trap_id,
						collectionMethodId: collection.collection_method_id,
						collectionLureId: collection.collection_lure_id,
						addressId: collection.address_id,
						collectionTimingMode: collection.collection_timing_mode,
						startedAt: collection.started_at,
						collectedAt: collection.collected_at,
						collectionDate: collection.collection_date,
						durationAmount: collection.duration_amount,
						durationUnitId: collection.duration_unit_id,
						setByProfileId: collection.set_by_profile_id,
						collectedByProfileId: collection.collected_by_profile_id,
						hasProblem: collection.has_problem,
						metadata: collection.metadata,
						latitude: collection.lat,
						longitude: collection.lng,
					})),
		},
		[id],
	);

	return { collection: result.data[0], isReady: result.isReady, isError: result.isError };
}
