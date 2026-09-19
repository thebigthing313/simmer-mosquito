import { eq, useLiveQuery } from '@tanstack/react-db';
import { assignment_items } from '../../lib/collections/assignment_items';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
/** One stop, in the vocabulary the run page speaks. */
export interface AssignmentItemView {
	readonly id: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
	readonly completedAt: Date | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: Date | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
}

/** An assignment's items in sequence, every entity type included. */
export function useAssignmentItems(assignmentId: string | null): {
	readonly items: readonly AssignmentItemView[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: assignment_items() })
				.where(({ item }) => eq(item.assignment_id, assignmentId ?? unmatchableId))
				.orderBy(({ item }) => item.position, 'asc')
				.select(({ item }) => ({
					id: item.id,
					entityType: item.entity_type,
					entityId: item.entity_id,
					position: item.position,
					directionsToNextItem: item.directions_to_next_item,
					completedAt: item.completed_at,
					completedByProfileId: item.completed_by_profile_id,
					skippedAt: item.skipped_at,
					skippedByProfileId: item.skipped_by_profile_id,
					skipReason: item.skip_reason,
				})),
	});

	return {
		items: result.data,
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
	};
}
