import { and, coalesce, concat, eq, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitats } from '../../lib/collections/habitats';
import { route_items } from '../../lib/collections/route_items';
import {
	type RouteStopCluster,
	type RouteStopView,
	stopTone,
} from '../../routes/larval-surveillance/habitats/-route-data';
import type { RouteStopFeature } from '../map/use-route-layer';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';

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

					// `undefined` here is the join still resolving, which is what
					// `isResolving` reports below.
					resolvedHabitatId: habitat.id,
					name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
					description: coalesce(habitat.description, ''),
					habitatTypeId: coalesce(habitat.habitat_type_id, null),
					lat: coalesce(habitat.lat, null),
					lng: coalesce(habitat.lng, null),
					isActive: coalesce(habitat.is_active, true),
					isInaccessible: coalesce(habitat.is_inaccessible, false),

					addressId: coalesce(habitat.address_id, null),
					addressLabel: coalesce(address.display_name, null),
				})),
	});

	const rows = result.data;

	// The `ordinal` is the one thing the query cannot produce: it is the stop's
	// place in the ordered result, and a projection sees a row rather than the
	// sequence. `position` is the stored sort key and can have gaps, so it is
	// not the number a crew reads off the list.
	const stops: RouteStopView[] = rows.map((row, index) => ({
		...row,
		ordinal: index + 1,
		name: row.name ?? `Habitat ${row.habitatId.slice(0, 8)}`,
		hasLocation: row.lat !== null && row.lng !== null,
		isResolving: row.resolvedHabitatId === undefined,
	}));

	const clusters = clusterByAddress(stops);

	const features: RouteStopFeature[] = stops
		.filter((stop) => stop.hasLocation)
		.map((stop) => ({
			id: stop.routeItemId,
			lng: stop.lng as number,
			lat: stop.lat as number,
			ordinal: stop.ordinal,
			tone: stopTone(stop),
		}));

	return {
		stops,
		clusters,
		features,
		itemCount: rows.length,
		isLoading: routeId !== null && result.isLoading,
	};
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
