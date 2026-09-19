import { eq, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';

/** One route stop, as a from-route snapshot copies it. */
export interface RouteSnapshotItem {
	readonly routeItemId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly directionsToNextItem: string | null;
}

/** A route's stops in order, as the whole rows a from-route snapshot copies. */
export function useRouteSnapshotItems(routeId: string | null): {
	readonly items: readonly RouteSnapshotItem[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: route_items() })
				.where(({ item }) => eq(item.route_id, routeId ?? unmatchableId))
				.orderBy(({ item }) => item.position, 'asc')
				.select(({ item }) => ({
					routeItemId: item.id,
					entityType: item.entity_type,
					entityId: item.entity_id,
					directionsToNextItem: item.directions_to_next_item,
				})),
	});

	return {
		items: result.data,
		isReady: routeId === null ? true : result.isReady,
	};
}
