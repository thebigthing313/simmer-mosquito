/**
 * Per-assignment stop tallies, so a list shows "3 of 8" without drilling in.
 *
 * The assignment half of `use-mission-item-counts.ts` — same three aggregates
 * over a different table, because the two worklists count their stops the same
 * way. They stay two hooks rather than one generic: what differs is the foreign
 * key the rows group by, and that is a column reference the query builder
 * resolves against a specific row type.
 */

import { and, caseWhen, count, inArray, isNull, not, sum, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { assignment_items } from '../../lib/collections/assignment_items';
import { activityGcTimeMs, unmatchableId } from './shared';
import { type WorklistProgress, worklistProgress } from './worklist-progress';

export function useAssignmentItemCounts(assignmentIds: readonly string[]): {
	readonly countsById: ReadonlyMap<string, WorklistProgress>;
	readonly isReady: boolean;
} {
	// Sorted and joined so a reordered id list does not re-run an identical query.
	const idsKey = useMemo(() => [...assignmentIds].sort().join(','), [assignmentIds]);
	const queryIds = assignmentIds.length > 0 ? [...assignmentIds] : [unmatchableId];

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ item: assignment_items() })
					.where(({ item }) => inArray(item.assignment_id, queryIds))
					.groupBy(({ item }) => item.assignment_id)
					.select(({ item }) => ({
						assignmentId: item.assignment_id,
						total: count(item.id),
						// Skipped is tested first, matching `readItemLifecycleTransition`: a
						// stop carrying both timestamps is skipped, so counting it as
						// completed as well would put `handled` above `total`.
						completed: sum(
							caseWhen(and(isNull(item.skipped_at), not(isNull(item.completed_at))), 1, 0),
						),
						skipped: sum(caseWhen(not(isNull(item.skipped_at)), 1, 0)),
					})),
		},
		[idsKey],
	);

	const countsById = useMemo(
		() =>
			new Map(
				result.data.map(
					(row) =>
						[
							row.assignmentId,
							worklistProgress(Number(row.total), Number(row.completed), Number(row.skipped)),
						] as const,
				),
			),
		[result.data],
	);

	return { countsById, isReady: result.isReady };
}
