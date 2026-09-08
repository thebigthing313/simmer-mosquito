/**
 * Every Trap's label, keyed by id.
 *
 * For the surfaces that show rows pointing at traps they did not fetch — the
 * collection explorer, whose rows come from `/map/collections` and carry a
 * `trapId` and nothing else. A join is the better answer wherever the rows come
 * from a collection; this is for where they do not.
 *
 * The whole table, uncapped, unlike {@link useHabitatNames}. Traps are an eager
 * shape because a trap network is a fixed set an organization maintains — the
 * rows are already local, and asking for a subset of what is already there
 * would cost a predicate and save nothing.
 *
 * The `Map` is the index exception `shared.ts` names: a query returns rows and
 * cannot return a lookup of them. The label inside it is composed rather than
 * projected, because `trapDisplayName` falls back to a substring of the id and
 * the expression language has no substring.
 */
import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { traps } from '../../lib/collections/traps';
import { trapDisplayName } from './trap-view';

export function useTrapNames(): ReadonlyMap<string, string> {
	const result = useLiveQuery(
		(query) =>
			query.from({ trap: traps() }).select(({ trap }) => ({
				id: trap.id,
				trapName: trap.trap_name,
				trapCode: trap.trap_code,
			})),
		[],
	);

	const rows = result.data;

	return useMemo(() => new Map(rows.map((row) => [row.id, trapDisplayName(row)] as const)), [rows]);
}
