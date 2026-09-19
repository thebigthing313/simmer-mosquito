import { eq, useLiveQuery } from '@tanstack/react-db';
import type { AssignmentView } from '../../components/operations/assignments/assignment-data';
import { assignments } from '../../lib/collections/assignments';
import { assignmentStatus } from '../queries/assignment-view';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
/** One assignment. Also the warm-stream anchor on pages that write before reading. */
export function useAssignment(assignmentId: string | null): {
	readonly assignment: AssignmentView | null;
	readonly isLoading: boolean;
	readonly isReady: boolean;
	/**
	 * The read failed. Distinct from a ready query holding no row: the edit page
	 * offers a retry for one and "no such record" for the other.
	 */
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ assignment: assignments() })
				.where(({ assignment }) => eq(assignment.id, assignmentId ?? unmatchableId))
				.select(({ assignment }) => ({
					id: assignment.id,
					assignmentName: assignment.assignment_name,
					assignmentDate: assignment.assignment_date,
					assignedToProfileId: assignment.assigned_to_profile_id,
					dueAt: assignment.due_at,
					startedAt: assignment.started_at,
					completedAt: assignment.completed_at,
					cancelledAt: assignment.cancelled_at,
					cancellationReason: assignment.cancellation_reason,
				})),
	});

	const row = result.data[0];

	return {
		assignment: row === undefined ? null : { ...row, status: assignmentStatus(row) },
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
		isError: result.isError,
	};
}
