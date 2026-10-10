import { and, eq, useLiveQuery } from '@tanstack/react-db';
import {
	type RouteStopCluster,
	type RouteStopResolution,
	type RouteStopView,
	stopTone,
} from '../../components/larval-surveillance/habitats/route-data';
import { addresses } from '../../lib/collections/addresses';
import { habitats } from '../../lib/collections/habitats';
import { route_items } from '../../lib/collections/route_items';
import type { RouteStopFeature } from '../map/use-route-layer';
import { joinedHabitatNameSelect } from '../queries/habitat-view';
import { activityGcTimeMs, joinedOrNull, unmatchableId } from '../queries/shared';

/**
 * The composed itinerary for a habitat route, in one join: ordered stops,
 * address clusters, and the point features the map layer draws. Everything
 * resolves from live collection subsets, so an edit to a stop's habitat
 * streams back without invalidation.
 */
export function useHabitatRouteStops(routeId: string | null): {
	readonly stops: readonly RouteStopView[];
	readonly clusters: readonly RouteStopCluster[];
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
						// Pushed into the predicate rather than filtered afterwards: a trap
						// route's items are rows this subset should never have loaded.
						eq(item.entity_type, 'habitat'),
					),
				)
				// `left` throughout: a stop whose Habitat has not streamed in yet still
				// belongs in the itinerary, drawn as resolving rather than dropped.
				.join(
					{ habitat: habitats() },
					({ item, habitat }) => eq(item.entity_id, habitat.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ habitat, address }) => eq(habitat.address_id, address.id),
					'left',
				)
				.orderBy(({ item }) => item.position, 'asc')
				.select(({ item, habitat, address }) => ({
					routeItemId: item.id,
					habitatId: item.entity_id,
					position: item.position,
					directionsToNextItem: item.directions_to_next_item,

					// `null` while the Habitat has not arrived, so the id fallback below
					// is reachable rather than a bare `, ` from `concat` over nothing.
					name: joinedHabitatNameSelect(habitat),
					// These three are `undefined` while the Habitat has not arrived,
					// which is not the same answer as a Habitat with no description or
					// one that is inactive: each column is never null, so a resolved one
					// reads `''` or a boolean. Left raw rather than through `joinedOrNull`
					// or a `coalesce` default, because the raw `| undefined` is what
					// `stopResolution` below reads as the joined row's presence.
					description: habitat.description,
					isActive: habitat.is_active,
					isInaccessible: habitat.is_inaccessible,
					habitatTypeId: joinedOrNull(habitat.habitat_type_id),
					lat: joinedOrNull(habitat.lat),
					lng: joinedOrNull(habitat.lng),

					addressId: joinedOrNull(habitat.address_id),
					addressLabel: joinedOrNull(address.display_name),
				})),
	});

	const rows = result.data;

	// The `ordinal` is the one thing the query cannot produce: it is the stop's
	// place in the ordered result, and a projection sees a row rather than the
	// sequence. `position` is the stored sort key and can have gaps, so it is
	// not the number a crew reads off the list.
	const stops: RouteStopView[] = rows.map(
		({ description, isActive, isInaccessible, ...row }, index) => ({
			...row,
			...stopResolution({ description, isActive, isInaccessible }),
			ordinal: index + 1,
			name: row.name ?? `Habitat ${row.habitatId.slice(0, 8)}`,
			hasLocation: row.lat !== null && row.lng !== null,
		}),
	);

	const clusters = clusterByAddress(stops);

	// A resolving stop has no location either, so skipping it changes nothing on
	// the map; testing `isResolving` is what lets `stopTone` read the status.
	const features: RouteStopFeature[] = stops.flatMap((stop) =>
		stop.isResolving || !stop.hasLocation
			? []
			: [
					{
						id: stop.routeItemId,
						lng: stop.lng as number,
						lat: stop.lat as number,
						ordinal: stop.ordinal,
						tone: stopTone(stop),
					},
				],
	);

	return {
		stops,
		clusters,
		features,
		itemCount: rows.length,
		isLoading: routeId !== null && result.isLoading,
	};
}

/**
 * A stop's `isResolving`, description and status from the joined Habitat's
 * columns. All three are one row's and never null, so each is `undefined`
 * exactly when the Habitat has not arrived and they are `undefined` together.
 * Testing each one rather than only the description is what lets `tsc` narrow
 * all three without an assertion, and it gives the same answer. The parameter
 * takes no `null`, so a nullable column would fail `tsc` here rather than read
 * as resolving.
 */
function stopResolution(joined: {
	readonly description: string | undefined;
	readonly isActive: boolean | undefined;
	readonly isInaccessible: boolean | undefined;
}): RouteStopResolution {
	const { description, isActive, isInaccessible } = joined;
	return description === undefined || isActive === undefined || isInaccessible === undefined
		? { isResolving: true, description: null }
		: { isResolving: false, description, isActive, isInaccessible };
}

/** Group consecutive stops that share a non-null address into one cluster. */
function clusterByAddress(stops: readonly RouteStopView[]): RouteStopCluster[] {
	const clusters: RouteStopCluster[] = [];
	for (const stop of stops) {
		const last = clusters.at(-1);
		if (last !== undefined && stop.addressId !== null && last.addressId === stop.addressId) {
			(last.stops as RouteStopView[]).push(stop);
		} else {
			clusters.push({
				key: stop.routeItemId,
				addressId: stop.addressId,
				addressLabel: stop.addressLabel,
				stops: [stop],
			});
		}
	}
	return clusters;
}
