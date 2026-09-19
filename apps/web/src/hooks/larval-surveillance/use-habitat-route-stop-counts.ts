import { eq, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { activityGcTimeMs } from '../queries/shared';

/** How many stops each route id holds, over the rows the subset returned. */
function countStopsByRouteId(
	stops: readonly { readonly routeId: string }[],
): ReadonlyMap<string, number> {
	const map = new Map<string, number>();
	for (const stop of stops) {
		map.set(stop.routeId, (map.get(stop.routeId) ?? 0) + 1);
	}
	return map;
}

/**
 * Habitat-stop counts for every route, keyed by route id, off the
 * organization-scoped `route_items` shape.
 */
export function useHabitatRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: route_items() })
				.where(({ item }) => eq(item.entity_type, 'habitat'))
				.select(({ item }) => ({ routeId: item.route_id })),
	});

	const stops = result.data;

	const countByRouteId = countStopsByRouteId(stops);

	return { countByRouteId, isLoading: result.isLoading };
}
