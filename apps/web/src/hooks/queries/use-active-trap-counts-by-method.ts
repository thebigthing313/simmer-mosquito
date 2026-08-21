/**
 * How many Traps are still running on each collection method.
 *
 * The collection-methods catalog uses it for two things: the count in the Active
 * Traps column, and whether Deactivate is offered at all. The server refuses to
 * retire a method active traps still reference, so a method with a non-zero count
 * has that action disabled with the count as the reason — a refusal the user can
 * read before making it is better than an error afterwards.
 *
 * Which is only sound because Traps sync eagerly. A count over an on-demand
 * collection would undercount and disable nothing, which is why the control-method
 * catalogs let the server refuse instead.
 */

import { count, eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { traps } from '../../lib/collections/traps';

export function useActiveTrapCountsByMethod(): ReadonlyMap<string, number> {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ trap: traps })
				.where(({ trap }) => eq(trap.is_active, true))
				.groupBy(({ trap }) => trap.collection_method_id)
				.select(({ trap }) => ({
					methodId: trap.collection_method_id,
					activeCount: count(trap.id),
				})),
		[],
	);

	// The one `useMemo` this folder allows: a query returns rows and cannot return
	// a lookup of them.
	return useMemo(
		() => new Map(result.data.map((row) => [row.methodId, row.activeCount])),
		[result.data],
	);
}
