import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { trapStopTone } from '../../components/adult-surveillance/traps/trap-route-data';
import { route_items } from '../../lib/collections/route_items';
import { traps } from '../../lib/collections/traps';
import type { RouteStopFeature } from '../map/use-route-layer';
import { activityGcTimeMs, joinedOrNull, unmatchableId } from '../queries/shared';
import { trapDisplayName } from '../queries/trap-view';

/**
 * One trap route stop: a route item joined to its trap, in route order.
 *
 * A union on `isResolving`, because the status is the Trap's and the stop
 * draws before the Trap arrives. A resolving stop carries no `isActive`, so a
 * reader has to narrow before it can ask whether the stop is active.
 */
export type TrapRouteStopView = TrapRouteStopFields & TrapRouteStopResolution;

/** Every field of a stop that both members of {@link TrapRouteStopView} share. */
interface TrapRouteStopFields {
	readonly routeItemId: string;
	readonly trapId: string;
	readonly ordinal: number;
	readonly position: number;
	readonly name: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly hasLocation: boolean;
	readonly directionsToNextItem: string | null;
}

/** Whether the Trap behind a stop has arrived, and its status if so. */
type TrapRouteStopResolution =
	| { readonly isResolving: false; readonly isActive: boolean }
	| { readonly isResolving: true };

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
					// `stopResolution` below reads: the column is never null, so a Trap
					// that has arrived reads a boolean. Left raw rather than through a
					// `coalesce` default, which would draw an unresolved stop as active.
					isActive: trap.is_active,
					trapName: joinedOrNull(trap.trap_name),
					trapCode: joinedOrNull(trap.trap_code),
					lat: joinedOrNull(trap.lat),
					lng: joinedOrNull(trap.lng),
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
		lat: row.lat,
		lng: row.lng,
		hasLocation: row.lat !== null && row.lng !== null,
		directionsToNextItem: row.directionsToNextItem,
		...stopResolution(row.isActive),
	}));

	// A resolving stop has no location either, so skipping it changes nothing on
	// the map; testing `isResolving` is what lets the tone read `isActive`.
	const features: readonly RouteStopFeature[] = stops.flatMap((stop) =>
		stop.isResolving || !stop.hasLocation
			? []
			: [
					{
						id: stop.routeItemId,
						lat: stop.lat as number,
						lng: stop.lng as number,
						ordinal: stop.ordinal,
						tone: trapStopTone(stop),
					},
				],
	);

	return { stops, features, itemCount: rows.length, isLoading: !result.isReady };
}

/**
 * A stop's `isResolving` and status from the one column that decides both, so
 * the two cannot disagree: the joined `is_active` is never null, so it is
 * `undefined` exactly when the Trap has not arrived.
 */
function stopResolution(isActive: boolean | undefined): TrapRouteStopResolution {
	return isActive === undefined ? { isResolving: true } : { isResolving: false, isActive };
}
