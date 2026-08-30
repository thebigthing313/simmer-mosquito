/**
 * Every Trap a collection form can be recorded against.
 *
 * Distinct from {@link useActiveTraps}, which lists the standing inventory. This
 * one carries retired traps too, and deliberately: a trap retired yesterday
 * still needs last week's collection recorded, and an *edit* of a collection
 * taken from a trap since retired has to be able to name that trap. Filtering
 * here would leave the source field blank on exactly those records, and a save
 * would then have nothing to inherit a location from.
 *
 * It also carries what the form derives from a chosen trap rather than only what
 * a picker row shows: the method and lure a trap-mode collection inherits, and
 * the point it takes its location from. Those are the four extra columns that
 * keep this from being `useActiveTraps` with a wider predicate.
 *
 * `traps` is eager, so this resolves without a fetch.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { traps } from '../../lib/collections/traps';

/** A Trap as a collection form holds one. */
export interface TrapOption {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	/** The second line of a picker row. */
	readonly description: string | null;
	/** Inherited by a trap-mode collection unless the form overrides it. */
	readonly collectionMethodId: string;
	/** Inherited the same way; `null` on a trap that runs unbaited. */
	readonly collectionLureId: string | null;
	/** Where a trap-mode collection is placed — it has no point of its own. */
	readonly latitude: number;
	readonly longitude: number;
}

export function useTrapOptions(): {
	readonly traps: readonly TrapOption[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query.from({ trap: traps }).select(({ trap }) => ({
				id: trap.id,
				trapName: trap.trap_name,
				trapCode: trap.trap_code,
				description: trap.description,
				collectionMethodId: trap.collection_method_id,
				collectionLureId: trap.collection_lure_id,
				latitude: trap.lat,
				longitude: trap.lng,
			})),
		[],
	);

	return { traps: result.data, isReady: result.isReady };
}
