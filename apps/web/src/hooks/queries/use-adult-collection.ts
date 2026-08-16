/**
 * One Adult Collection, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * ## What this replaces
 *
 * Four sequential queries: the collection, then the trap it came from, then the
 * method, then the address — each waiting on the render before it. The trap leg
 * was the expensive one, because `collections` is on-demand and the trap's id
 * only exists once the collection row has arrived.
 */

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { collections } from '../../lib/collections/collections';
import { traps } from '../../lib/collections/traps';
import type { AdultCollection } from './collection-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useAdultCollection(
	collectionId: string | null,
	options?: { readonly gcTime?: number },
): { readonly collection: AdultCollection | undefined; readonly isReady: boolean } {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ collection: collections })
					.where(({ collection }) => eq(collection.id, collectionId ?? unmatchableId))
					// `left` throughout: an ad-hoc collection names no trap, most name no
					// lure and no address, and an `inner` join would drop the row entirely
					// rather than leave a field blank.
					.join({ trap: traps }, ({ collection, trap }) => eq(collection.trap_id, trap.id), 'left')
					.join(
						{ method: collection_methods },
						({ collection, method }) => eq(collection.collection_method_id, method.id),
						'left',
					)
					.join(
						{ lure: collection_lures },
						({ collection, lure }) => eq(collection.collection_lure_id, lure.id),
						'left',
					)
					.join(
						{ address: addresses },
						({ collection, address }) => eq(collection.address_id, address.id),
						'left',
					)
					.select(({ collection, trap, method, lure, address }) => ({
						id: collection.id,
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						trapId: collection.trap_id,
						// The discriminator: `undefined` while the trap is still streaming,
						// which is the one state the name columns cannot tell apart from a
						// trap that has no name.
						resolvedTrapId: trap.id,
						trapName: coalesce(trap.trap_name, null),
						trapCode: coalesce(trap.trap_code, null),

						methodId: collection.collection_method_id,
						methodName: coalesce(method.name, 'Unknown method'),
						lureId: collection.collection_lure_id,
						lureName: caseWhen(isNull(collection.collection_lure_id), null, lure.name),
						addressId: collection.address_id,

						collectedAt: collection.collected_at,
						collectionDate: collection.collection_date,
						collectionTimingMode: collection.collection_timing_mode,
						collectedByProfileId: collection.collected_by_profile_id,
						startedAt: collection.started_at,
						setByProfileId: collection.set_by_profile_id,
						durationAmount: collection.duration_amount,
						durationUnitId: collection.duration_unit_id,

						hasProblem: collection.has_problem,
						isZeroResult: collection.is_zero_result,
						hasBycatch: collection.has_bycatch,

						latitude: collection.lat,
						longitude: collection.lng,
						geometryKind: collection.geom_type,
						metadata: collection.metadata,
						createdAt: collection.created_at,
						updatedAt: collection.updated_at,
						createdByProfileId: collection.created_by_profile_id,
						updatedByProfileId: collection.updated_by_profile_id,
					})),
		},
		[collectionId],
	);

	return { collection: result.data[0], isReady: result.isReady };
}
