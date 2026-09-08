/**
 * Every Profile's display name, keyed by id.
 *
 * For the surfaces that hold a profile id they did not join — an activity feed,
 * whose rows come from three different tables and name an actor by id alone.
 * Anywhere one row means one person, join it instead; the recent-activity hooks
 * all do.
 *
 * Profiles are eager and an organization has tens of them, so this reads the
 * whole table. Status-gated rather than suspending: a panel should resolve
 * names without holding up the page it sits on.
 *
 * The `Map` is the index exception `shared.ts` names — a query returns rows and
 * cannot return a lookup of them.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { profiles } from '../../lib/collections/profiles';

export function useProfileNames(): ReadonlyMap<string, string> {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ profile: profiles() })
				.select(({ profile }) => ({ id: profile.id, name: profile.display_name })),
		[],
	);

	const rows = result.data;

	return useMemo(() => new Map(rows.map((row) => [row.id, row.name] as const)), [rows]);
}
