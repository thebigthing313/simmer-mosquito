/**
 * One Trap, as its own edit form reads it.
 *
 * The counterpart of `use-habitat-record.ts` and `use-inspection-record.ts`, and
 * here for the same reason: `use-trap.ts` joins the method, the lure and the
 * address so a card can name them, and a form writes ids rather than names. It
 * also coalesces the method name to `Unknown method`, which is right on a card
 * and wrong in a field.
 *
 * `organizationId` rides along because the form's address picker is scoped by it,
 * and `updatedAt` because the form keys its geometry fetch on it — a re-opened
 * form loads the point as it stands rather than a cached earlier one.
 *
 * `traps` is eager, so this resolves without a fetch.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { traps } from '../../lib/collections/traps';
import { unmatchableId } from './shared';

/** A Trap as its edit form holds one. */
export interface TrapRecord {
	readonly id: string;
	readonly organizationId: string;
	/** `null` when the trap is known by its code alone. */
	readonly trapName: string | null;
	/** `null` when the trap is known by its name alone. */
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly collectionMethodId: string;
	/** `null` on a trap that runs unbaited. */
	readonly collectionLureId: string | null;
	/** Reference only — the point below is what the trap is located by. */
	readonly addressId: string | null;
	readonly isActive: boolean;
	readonly latitude: number;
	readonly longitude: number;
	/** What the geometry fetch is keyed on, so an edited point is not read back stale. */
	readonly updatedAt: Date;
}

export function useTrapRecord(trapId: string | null | undefined): {
	readonly trap: TrapRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = trapId ?? unmatchableId;

	const result = useLiveQuery(
		(query) =>
			query
				.from({ trap: traps() })
				.where(({ trap }) => eq(trap.id, id))
				.select(({ trap }) => ({
					id: trap.id,
					organizationId: trap.organization_id,
					trapName: trap.trap_name,
					trapCode: trap.trap_code,
					description: trap.description,
					collectionMethodId: trap.collection_method_id,
					collectionLureId: trap.collection_lure_id,
					addressId: trap.address_id,
					isActive: trap.is_active,
					latitude: trap.lat,
					longitude: trap.lng,
					updatedAt: trap.updated_at,
				})),
		[id],
	);

	return { trap: result.data[0], isReady: result.isReady, isError: result.isError };
}
