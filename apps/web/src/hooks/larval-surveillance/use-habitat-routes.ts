import { eq, useLiveQuery } from '@tanstack/react-db';
import type { RouteSummary } from '../../components/route-planning/route-summary';
import { routes } from '../../lib/collections/routes';
import { NATURAL_ORDER } from '../../lib/natural-order';

/**
 * All habitat-typed routes for the active organization, sorted by name in the
 * query's own ordering.
 */
export function useHabitatRoutes(): {
	readonly routes: readonly RouteSummary[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
	/**
	 * The read failed. Distinct from a ready query holding no route: the edit
	 * page offers a retry for one and "no such record" for the other.
	 */
	readonly isError: boolean;
} {
	const result = useLiveQuery((query) =>
		query
			.from({ route: routes() })
			.where(({ route }) => eq(route.route_type, 'habitat'))
			.orderBy(({ route }) => route.route_name, NATURAL_ORDER)
			.select(({ route }) => ({ id: route.id, routeName: route.route_name })),
	);

	return {
		routes: result.data,
		isLoading: result.isLoading,
		isReady: result.isReady,
		isError: result.isError,
	};
}
