/**
 * One Trap, with everything a card shows it beside.
 *
 * The map focus card, which appears next to a map that is already drawn — so it
 * renders its own skeleton rather than suspending and blanking what surrounds it.
 *
 * ## What this replaces
 *
 * Four sequential queries. The card read the trap, then the method it collects
 * with, then its lure, then its address — each waiting on the render before it,
 * because each needed an id the query before it returned. Opening a card cost
 * four round trips through React to assemble one row.
 */

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { traps } from '../../lib/collections/traps';
import { mapCardGcTimeMs, unmatchableId } from './shared';
import type { Trap } from './trap-view';

/**
 * Takes a nullable id so a form can ask before the user has chosen a Trap. A hook
 * cannot be called conditionally, so the absent case asks for an id no row has
 * rather than being skipped — an empty result instead of the whole table.
 */
export function useTrap(
	trapId: string | null,
	options?: { readonly gcTime?: number },
): { readonly trap: Trap | undefined; readonly isReady: boolean } {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ trap: traps })
					.where(({ trap }) => eq(trap.id, trapId ?? unmatchableId))
					// `left` throughout: an unbaited Trap has no lure and most have no
					// address, and an `inner` join would drop those traps from their own
					// cards rather than leaving a field blank.
					.join(
						{ method: collection_methods },
						({ trap, method }) => eq(trap.collection_method_id, method.id),
						'left',
					)
					.join(
						{ lure: collection_lures },
						({ trap, lure }) => eq(trap.collection_lure_id, lure.id),
						'left',
					)
					.join(
						{ address: addresses },
						({ trap, address }) => eq(trap.address_id, address.id),
						'left',
					)
					.select(({ trap, method, lure, address }) => ({
						id: trap.id,
						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},
						trapName: trap.trap_name,
						trapCode: trap.trap_code,
						description: trap.description,
						methodId: trap.collection_method_id,
						// `collection_method_id` is not nullable, so there is no absent case
						// to carry — only the join not having resolved yet.
						methodName: coalesce(method.name, 'Unknown method'),
						lureId: trap.collection_lure_id,
						// Guarded on the Trap's own column, so an unbaited trap reads as
						// `null` rather than as the `undefined` an unmatched join yields.
						lureName: caseWhen(isNull(trap.collection_lure_id), null, lure.name),
						addressId: trap.address_id,
						isActive: trap.is_active,
						latitude: trap.lat,
						longitude: trap.lng,
						geometryKind: trap.geom_type,
						createdAt: trap.created_at,
						updatedAt: trap.updated_at,
						createdByProfileId: trap.created_by_profile_id,
						updatedByProfileId: trap.updated_by_profile_id,
					})),
		},
		[trapId],
	);

	return { trap: result.data[0], isReady: result.isReady };
}
