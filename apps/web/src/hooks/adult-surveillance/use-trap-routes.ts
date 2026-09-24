import { eq, useLiveQuery } from '@tanstack/react-db';
import type { RouteSummary } from '../../components/route-planning/route-summary';
import { routes } from '../../lib/collections/routes';
import { NATURAL_ORDER } from '../../lib/natural-order';

/** All trap routes, sorted by name in the query's own ordering. */
export function useTrapRoutes(): {
	readonly routes: readonly RouteSummary[];
	readonly isReady: boolean;
	readonly isLoading: boolean;
	/**
	 * The read failed. Distinct from a ready query holding no route: the edit
	 * page offers a retry for one and "no such record" for the other.
	 */
	readonly isError: boolean;
} {
	const result = useLiveQuery((query) =>
		query
			.from({ route: routes() })
			.where(({ route }) => eq(route.route_type, 'trap'))
			.orderBy(({ route }) => route.route_name, NATURAL_ORDER)
			.select(({ route }) => ({ id: route.id, routeName: route.route_name })),
	);

	return {
		routes: result.data,
		isReady: result.isReady,
		isLoading: !result.isReady,
		isError: result.isError,
	};
}
