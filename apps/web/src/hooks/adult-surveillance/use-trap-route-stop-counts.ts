import { eq, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { activityGcTimeMs } from '../queries/shared';

/** How many stops each route id holds, over the rows the subset returned. */
function countStopsByRouteId(
	rows: readonly { readonly routeId: string }[],
): ReadonlyMap<string, number> {
	const map = new Map<string, number>();
	for (const row of rows) {
		map.set(row.routeId, (map.get(row.routeId) ?? 0) + 1);
	}
	return map;
}

/** Stop counts per trap route, from the on-demand `route_items` subset. */
export function useTrapRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: route_items() })
				.where(({ item }) => eq(item.entity_type, 'trap'))
				.select(({ item }) => ({ routeId: item.route_id })),
	});

	const rows = result.data;

	const countByRouteId = countStopsByRouteId(rows);

	return { countByRouteId, isLoading: !result.isReady };
}
