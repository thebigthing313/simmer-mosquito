import type { RouteType } from '@simmer-mosquito/domain';
import { useLiveQuery } from '@tanstack/react-db';
import type { RouteSummary } from '../../components/route-planning/route-summary';
import { routes } from '../../lib/collections/routes';

/** A route, with the kind of record its stops point at. */
export interface RouteCatalogEntry extends RouteSummary {
	readonly routeType: RouteType;
}

/** Every standing Route the organization has, of either kind, sorted by name. */
export function useRouteCatalog(): {
	readonly routes: readonly RouteCatalogEntry[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery((query) =>
		query
			.from({ route: routes() })
			.orderBy(({ route }) => route.route_name, 'asc')
			.select(({ route }) => ({
				id: route.id,
				routeName: route.route_name,
				routeType: route.route_type,
			})),
	);

	return { routes: result.data, isReady: result.isReady };
}
