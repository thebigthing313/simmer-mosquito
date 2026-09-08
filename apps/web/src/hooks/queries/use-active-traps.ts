/**
 * Every Trap the organization is currently running, in the order they read.
 *
 * The standing inventory: the trap directory's left half, and anywhere else that
 * lists what is deployed right now. Retired traps are excluded in the predicate
 * rather than filtered afterwards — a surface that wants those wants a different
 * question, and should not have to pay for the ones it is about to drop.
 *
 * ## The sort
 *
 * By code, then by name, which is the order `trapDisplayName` composes them in.
 * It replaces a `localeCompare` over the composed label and compares strings the
 * same way it did. `@tanstack/db` defaults a collection's `stringSort` to
 * `locale`, `orderBy` inherits that when the clause does not set it, and the
 * ascending comparator calls `localeCompare` under it. So `a-1` sorts before
 * `Z-1`, case is folded, and a folded column would buy nothing here.
 *
 * A trap with neither a code nor a name reads as its short id on screen, and
 * does not sort by it. `coalesce` yields no value for such a trap, `orderBy`
 * defaults `nulls` to `first`, and the second clause is the name, which is
 * missing too. They land together at the head of the list. There is no third
 * thing to sort them by that an operator would recognise.
 */
import { coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { collection_methods } from '../../lib/collections/collection_methods';
import { traps } from '../../lib/collections/traps';

/** A Trap as a list of them shows one: its label, and what it collects with. */
export interface TrapListing {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly methodId: string;
	readonly methodName: string;
	/** What the trap is, in the operator's words — the second line of a picker row. */
	readonly description: string | null;
	/**
	 * Always `true` from this hook, and carried anyway so a surface that shows a
	 * trap's status reads it off the trap rather than inferring it from which hook
	 * it came out of. That inference is right until someone reuses the shape.
	 */
	readonly isActive: boolean;
}

export function useActiveTraps(): {
	readonly traps: readonly TrapListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ trap: traps() })
				.where(({ trap }) => eq(trap.is_active, true))
				// `left`: a method that has been retired out from under a trap should not
				// take the trap off the screen with it.
				.join(
					{ method: collection_methods() },
					({ trap, method }) => eq(trap.collection_method_id, method.id),
					'left',
				)
				.orderBy(({ trap }) => coalesce(trap.trap_code, trap.trap_name), 'asc')
				.orderBy(({ trap }) => trap.trap_name, 'asc')
				.select(({ trap, method }) => ({
					id: trap.id,
					trapName: trap.trap_name,
					trapCode: trap.trap_code,
					methodId: trap.collection_method_id,
					methodName: coalesce(method.name, 'Unknown method'),
					description: trap.description,
					isActive: trap.is_active,
				})),
		[],
	);

	return { traps: result.data, isReady: result.isReady };
}
