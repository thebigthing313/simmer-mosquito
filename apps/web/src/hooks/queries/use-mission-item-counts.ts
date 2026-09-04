/**
 * Per-mission stop tallies, so a list shows "3 of 8" without drilling in.
 *
 * Three aggregates grouped by mission rather than every stop row folded in
 * JavaScript. The tallies are computed in the query pipeline, so a stop that gets
 * worked emits three changed numbers for one mission instead of a fresh array of
 * every stop on every mission in the window.
 *
 * The subset is the ids the caller can see, not the whole window. `mission_items`
 * is on-demand and grows with every day worked, so asking only about the rows a
 * page is about to render is the point of the mode.
 */

import { and, caseWhen, count, inArray, isNull, not, sum, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { mission_items } from '../../lib/collections/mission_items';
import { activityGcTimeMs, unmatchableId } from './shared';
import { type WorklistProgress, worklistProgress } from './worklist-progress';

export function useMissionItemCounts(missionIds: readonly string[]): {
	readonly countsById: ReadonlyMap<string, WorklistProgress>;
	readonly isReady: boolean;
} {
	// Sorted and joined so a reordered id list does not re-run an identical query.
	const idsKey = useMemo(() => [...missionIds].sort().join(','), [missionIds]);
	const queryIds = missionIds.length > 0 ? [...missionIds] : [unmatchableId];

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ item: mission_items() })
					.where(({ item }) => inArray(item.mission_id, queryIds))
					.groupBy(({ item }) => item.mission_id)
					.select(({ item }) => ({
						missionId: item.mission_id,
						total: count(item.id),
						// Skipped is tested first, matching `deriveMissionItemStatus`: a stop
						// carrying both timestamps is skipped, so counting it as completed as
						// well would put `handled` above `total`.
						completed: sum(
							caseWhen(and(isNull(item.skipped_at), not(isNull(item.completed_at))), 1, 0),
						),
						skipped: sum(caseWhen(not(isNull(item.skipped_at)), 1, 0)),
					})),
		},
		[idsKey],
	);

	// An index, which is the one thing a query cannot return: it yields rows, and
	// what every caller wants is a lookup of them by mission.
	const countsById = useMemo(
		() =>
			new Map(
				result.data.map(
					(row) =>
						[
							row.missionId,
							worklistProgress(Number(row.total), Number(row.completed), Number(row.skipped)),
						] as const,
				),
			),
		[result.data],
	);

	return { countsById, isReady: result.isReady };
}
