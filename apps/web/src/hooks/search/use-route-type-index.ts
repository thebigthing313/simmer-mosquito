import { useLiveQuery } from '@tanstack/react-db';
import type { RouteTypeIndex } from '../../components/search/search-destinations';
import { routes as routesCollection } from '../../lib/collections/routes';

/**
 * The route type of each route, read off the `routes` collection. Reports
 * `loading` until the live query is ready.
 */
export function useRouteTypeIndex(): RouteTypeIndex {
	const lookup = useLiveQuery((builder) => builder.from({ row: routesCollection() }));

	if (!lookup.isReady) {
		return { status: 'loading' };
	}

	const rows = lookup.data ?? [];
	return {
		status: 'ready',
		routeTypeOf: (routeId) => rows.find((row) => row.id === routeId)?.route_type,
	};
}
