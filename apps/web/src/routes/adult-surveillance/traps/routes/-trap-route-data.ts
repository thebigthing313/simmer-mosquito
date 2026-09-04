import { and, coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { RouteStopFeature } from '../../../../components/map';
import type { RouteSummary } from '../../../../components/route-planning/route-summary';
import { trapDisplayName } from '../../../../hooks/queries/trap-view';
import { route_items } from '../../../../lib/collections/route_items';
import { routes } from '../../../../lib/collections/routes';
import { traps } from '../../../../lib/collections/traps';

// Trap routes reuse the shared `routes` / `route_items` tables — a route with
// `route_type: 'trap'`, its stops `route_items` with `entity_type: 'trap'`.
// `routes` is eager; `route_items` is on-demand (docs/sync.md), kept warm briefly
// so index → detail → edit hops reuse the subset.
const routeItemsGcTimeMs = 30_000;

// A syntactically valid uuid that matches no row — keeps an `eq` subset predicate
// live (and empty) while a route id is still unresolved.
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/** One resolved stop: a route item joined to its trap, in route order. */
export interface RouteStopView {
	readonly routeItemId: string;
	readonly trapId: string;
	readonly ordinal: number;
	readonly position: number;
	readonly name: string;
	readonly isActive: boolean;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly hasLocation: boolean;
	readonly directionsToNextItem: string | null;
	/** True while the trap row behind this stop is still resolving. */
	readonly isResolving: boolean;
}

/**
 * All trap routes, sorted by name.
 *
 * The sort moved into the query, which drops `localeCompare`'s
 * `sensitivity: 'base'` — the same trade the habitat routes made, for the same
 * reason: route names in practice are codes and zone numbers.
 */
export function useTrapRoutes(): {
	readonly routes: readonly RouteSummary[];
	readonly isReady: boolean;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ route: routes() })
				.where(({ route }) => eq(route.route_type, 'trap'))
				.orderBy(({ route }) => route.route_name, 'asc')
				.select(({ route }) => ({ id: route.id, routeName: route.route_name })),
		[],
	);

	return { routes: result.data, isReady: result.isReady, isLoading: !result.isReady };
}

/** Stop counts per trap route, from the on-demand `route_items` subset. */
export function useRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: route_items() })
					.where(({ item }) => eq(item.entity_type, 'trap'))
					.select(({ item }) => ({ routeId: item.route_id })),
		},
		[],
	);

	const rows = result.data;

	const countByRouteId = useMemo(() => {
		const map = new Map<string, number>();
		for (const row of rows) {
			map.set(row.routeId, (map.get(row.routeId) ?? 0) + 1);
		}
		return map;
	}, [rows]);

	return { countByRouteId, isLoading: !result.isReady };
}

/**
 * The ordered stops of one trap route, and the point features the map layer draws.
 *
 * ## One query, not two
 *
 * This read the whole eager `traps` table into a `Map` and looked each stop's
 * trap up in it. The join does the same work without materialising every trap the
 * agency runs to name the twenty on this route.
 */
export function useRouteStops(routeId: string | null): {
	readonly stops: readonly RouteStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly itemCount: number;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: route_items() })
					.where(({ item }) =>
						and(
							// An unmatchable id keeps the hook order stable while no route is
							// selected — a live query cannot be conditional.
							eq(item.route_id, routeId ?? UNMATCHABLE_ID),
							// Pushed into the predicate rather than filtered afterwards: a
							// habitat route's items are rows this subset should never load.
							eq(item.entity_type, 'trap'),
						),
					)
					// `left`: a stop whose Trap has not streamed in yet still belongs in the
					// itinerary, drawn as resolving rather than dropped.
					.join({ trap: traps() }, ({ item, trap }) => eq(item.entity_id, trap.id), 'left')
					.orderBy(({ item }) => item.position, 'asc')
					.select(({ item, trap }) => ({
						routeItemId: item.id,
						trapId: item.entity_id,
						position: item.position,
						directionsToNextItem: item.directions_to_next_item,

						// `undefined` here is the join still resolving, which is what
						// `isResolving` reports below.
						resolvedTrapId: trap.id,
						trapName: coalesce(trap.trap_name, null),
						trapCode: coalesce(trap.trap_code, null),
						isActive: coalesce(trap.is_active, true),
						lat: coalesce(trap.lat, null),
						lng: coalesce(trap.lng, null),
					})),
		},
		[routeId],
	);

	const rows = result.data;

	const stops = useMemo<readonly RouteStopView[]>(
		() =>
			// The `ordinal` is the one thing the query cannot produce: it is the stop's
			// place in the ordered result, and a projection sees a row rather than the
			// sequence. `position` is the stored sort key and can have gaps, so it is
			// not the number a crew reads off the list.
			rows.map((row, index) => ({
				routeItemId: row.routeItemId,
				trapId: row.trapId,
				ordinal: index + 1,
				position: row.position,
				name: trapDisplayName({
					id: row.trapId,
					trapName: row.trapName,
					trapCode: row.trapCode,
				}),
				isActive: row.isActive,
				lat: row.lat,
				lng: row.lng,
				hasLocation: row.lat !== null && row.lng !== null,
				directionsToNextItem: row.directionsToNextItem,
				isResolving: row.resolvedTrapId === undefined,
			})),
		[rows],
	);

	const features = useMemo<readonly RouteStopFeature[]>(
		() =>
			stops
				.filter((stop) => stop.hasLocation)
				.map((stop) => ({
					id: stop.routeItemId,
					lat: stop.lat as number,
					lng: stop.lng as number,
					ordinal: stop.ordinal,
					tone: stop.isActive ? ('default' as const) : ('inactive' as const),
				})),
		[stops],
	);

	return { stops, features, itemCount: rows.length, isLoading: !result.isReady };
}
