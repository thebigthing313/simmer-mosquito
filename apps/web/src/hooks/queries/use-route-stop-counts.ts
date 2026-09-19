import { count, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { routeItemsGcTimeMs } from './use-routes';
/** How many stops each Route holds, of either kind, keyed by route id. */
export function useRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		gcTime: routeItemsGcTimeMs,
		query: (query) =>
			query
				.from({ item: route_items() })
				.groupBy(({ item }) => item.route_id)
				.select(({ item }) => ({ routeId: item.route_id, stops: count(item.id) })),
	});

	const rows = result.data;

	const countByRouteId = new Map(rows.map((row) => [row.routeId, row.stops]));

	return { countByRouteId, isReady: result.isReady };
}
