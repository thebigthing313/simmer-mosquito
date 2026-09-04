/**
 * Every standing Route the agency has, of either kind.
 *
 * The two planning surfaces read their own kind — `useHabitatRoutes` and
 * `useTrapRoutes` each filter on `route_type`, because a habitat route and a trap
 * route are different screens with different stop pickers. This is for the one
 * caller that wants both: snapshotting a Route into an Assignment, which mixes
 * trap, habitat and service-request stops by design and so has no reason to
 * prefer one kind.
 *
 * The sort is in the query, which drops `localeCompare`'s case folding — the
 * same trade both surface hooks make, and for the same reason: route names in
 * practice are codes and zone numbers.
 */

import type { RouteType } from '@simmer-mosquito/domain';
import { count, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { RouteSummary } from '../../components/route-planning/route-summary';
import { route_items } from '../../lib/collections/route_items';
import { routes } from '../../lib/collections/routes';

// `route_items` is on-demand (docs/sync.md); hold the counts briefly after
// unmount so opening the picker twice does not ask twice.
const routeItemsGcTimeMs = 30_000;

/** A route, with the kind of record its stops point at. */
export interface RouteCatalogEntry extends RouteSummary {
	readonly routeType: RouteType;
}

export function useRouteCatalog(): {
	readonly routes: readonly RouteCatalogEntry[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ route: routes() })
				.orderBy(({ route }) => route.route_name, 'asc')
				.select(({ route }) => ({
					id: route.id,
					routeName: route.route_name,
					routeType: route.route_type,
				})),
		[],
	);

	return { routes: result.data, isReady: result.isReady };
}

/**
 * How many stops each Route holds, whatever kind they are.
 *
 * Deliberately unfiltered by `entity_type`, unlike the per-surface count hooks:
 * a picker that offers both kinds of route and reports zero stops for half of
 * them is worse than one that reports none at all.
 */
export function useRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: route_items() })
					.groupBy(({ item }) => item.route_id)
					.select(({ item }) => ({ routeId: item.route_id, stops: count(item.id) })),
		},
		[],
	);

	const rows = result.data;

	const countByRouteId = useMemo(
		() => new Map(rows.map((row) => [row.routeId, row.stops])),
		[rows],
	);

	return { countByRouteId, isReady: result.isReady };
}
