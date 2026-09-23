import { and, coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { traps } from '../../lib/collections/traps';
import type { RouteStopFeature } from '../map/use-route-layer';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
import { trapDisplayName } from '../queries/trap-view';

/** One resolved trap route stop: a route item joined to its trap, in route order. */
export interface TrapRouteStopView {
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
 * The ordered stops of one trap route, joined to their traps in one query, and
 * the point features the map layer draws.
 */
export function useTrapRouteStops(routeId: string | null): {
	readonly stops: readonly TrapRouteStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly itemCount: number;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ item: route_items() })
				.where(({ item }) =>
					and(
						// An unmatchable id keeps the hook order stable while no route is
						// selected — a live query cannot be conditional.
						eq(item.route_id, routeId ?? unmatchableId),
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
	});

	const rows = result.data;

	// The `ordinal` is the one thing the query cannot produce: it is the stop's
	// place in the ordered result, and a projection sees a row rather than the
	// sequence. `position` is the stored sort key and can have gaps, so it is
	// not the number a crew reads off the list.
	const stops: readonly TrapRouteStopView[] = rows.map((row, index) => ({
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
	}));

	const features: readonly RouteStopFeature[] = stops
		.filter((stop) => stop.hasLocation)
		.map((stop) => ({
			id: stop.routeItemId,
			lat: stop.lat as number,
			lng: stop.lng as number,
			ordinal: stop.ordinal,
			tone: stop.isActive ? ('default' as const) : ('inactive' as const),
		}));

	return { stops, features, itemCount: rows.length, isLoading: !result.isReady };
}
