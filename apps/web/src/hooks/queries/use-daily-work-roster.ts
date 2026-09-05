/**
 * The Profiles behind the Overview sidebar's Daily Work group.
 *
 * Live rather than a snapshot: deactivating somebody, or deleting them, has to
 * take their row out of the sidebar of everyone who has the app open. The shape
 * predicate drops soft-deleted rows upstream, so `is_active` is the only test
 * left to make here.
 *
 * Status-gated `useLiveQuery` rather than the suspense hook: the sidebar is
 * chrome, and holding the whole workspace behind a cold profiles shape to draw
 * a list of names is the wrong trade. Until it is ready the group is absent.
 *
 * Distinct from `useProfileRoster`, which every record form reads: that one
 * keeps the deactivated rows selectable and says nothing about readiness,
 * because a form that has already rendered has nothing to do with the answer.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { DailyWorkPerson, DailyWorkRoster } from '../../components/app-shell/navigation';
import { profiles } from '../../lib/collections/profiles';

/** One `profiles` row, as the group needs it. */
interface DailyWorkProfileRow {
	readonly id: string;
	readonly display_name: string;
	readonly is_active: boolean;
}

/**
 * The two lists, from the rows and whether they have arrived.
 *
 * `localeCompare` rather than the query pipeline's `orderBy`: this is a list of
 * people's names read top to bottom, and the pipeline sorts Ángela after Zoe.
 * Tens of rows re-sorted when one changes costs nothing here.
 */
export function dailyWorkRoster(
	rows: readonly DailyWorkProfileRow[],
	isReady: boolean,
): DailyWorkRoster {
	if (!isReady) {
		return { listed: null, routable: null };
	}

	const byName = [...rows].sort((left, right) =>
		left.display_name.localeCompare(right.display_name),
	);
	const person = (row: DailyWorkProfileRow): DailyWorkPerson => ({
		id: row.id,
		name: row.display_name,
	});

	return {
		listed: byName.filter((row) => row.is_active).map(person),
		routable: byName.map(person),
	};
}

export function useDailyWorkRoster(): DailyWorkRoster {
	const result = useLiveQuery(
		(query) =>
			query.from({ profile: profiles() }).select(({ profile }) => ({
				id: profile.id,
				display_name: profile.display_name,
				is_active: profile.is_active,
			})),
		[],
	);

	const rows = result.data;
	const { isReady } = result;

	return useMemo(() => dailyWorkRoster(rows, isReady), [rows, isReady]);
}
