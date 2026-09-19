import {
	type AssignmentStopView,
	assignmentStopTone,
	itemProgress,
	progressCounts,
	targetTypeOf,
} from '../../components/operations/assignments/assignment-data';
import type { RouteStopFeature } from '../map/use-route-layer';
import type { ProgressCounts } from '../queries/assignment-view';
import { useAssignmentItems } from './use-assignment-items';
import { targetKey, useAssignmentTargets } from './use-assignment-targets';
import { usePendingTrapCollections } from './use-pending-trap-collections';
/** An assignment's stops, joined to their targets and ready to render or map. */
export function useAssignmentStops(assignmentId: string | null): {
	readonly stops: readonly AssignmentStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly counts: ProgressCounts;
	readonly isLoading: boolean;
} {
	const { items, isLoading: itemsLoading } = useAssignmentItems(assignmentId);
	const { byKey, isReady: targetsReady } = useAssignmentTargets(items);
	const pendingByTrapId = usePendingTrapCollections(items);

	const stops: readonly AssignmentStopView[] = items.map((item, index) => {
		const type = targetTypeOf(item.entityType);
		const target = type === null ? undefined : byKey.get(targetKey(type, item.entityId));
		const progress = itemProgress(item);
		return {
			pendingCollectionId: type === 'trap' ? (pendingByTrapId.get(item.entityId) ?? null) : null,
			assignmentItemId: item.id,
			ordinal: index + 1,
			position: item.position,
			entityType: type,
			entityId: item.entityId,
			directionsToNextItem: item.directionsToNextItem,
			completedAt: item.completedAt,
			completedByProfileId: item.completedByProfileId,
			skippedAt: item.skippedAt,
			skippedByProfileId: item.skippedByProfileId,
			skipReason: item.skipReason,
			progress,
			target: target ?? null,
			hasLocation: target?.lat != null && target?.lng != null,
			isResolving: target === undefined && !targetsReady,
		};
	});

	const features: RouteStopFeature[] = stops
		.filter((stop) => stop.hasLocation)
		.map((stop) => ({
			id: stop.assignmentItemId,
			lng: stop.target?.lng as number,
			lat: stop.target?.lat as number,
			ordinal: stop.ordinal,
			tone: assignmentStopTone(stop),
		}));

	return {
		stops,
		features,
		counts: progressCounts(stops),
		isLoading: itemsLoading,
	};
}
