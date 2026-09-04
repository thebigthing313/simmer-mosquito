import { sessionFetch } from '@simmer-mosquito/sync';
import { and, coalesce, concat, eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../../auth';
import type { RouteStopFeature } from '../../../components/map';
import type { RouteSummary } from '../../../components/route-planning/route-summary';
import { addresses } from '../../../lib/collections/addresses';
import { habitats } from '../../../lib/collections/habitats';
import { route_items } from '../../../lib/collections/route_items';
import { routes } from '../../../lib/collections/routes';

// `route_items` is an on-demand shape (docs/sync.md); keep a route's members warm
// briefly after unmount so hopping index → detail → edit reuses the subset.
const routeItemsGcTimeMs = 30_000;

// A syntactically valid uuid that matches no row — keeps an `IN`/`eq` subset
// predicate live (and empty) while a route/id set is still unresolved.
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/** The slice of a habitat the route surfaces need — geometry, status, address. */
export interface HabitatSite {
	readonly id: string;
	readonly habitatName: string | null;
	readonly description: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly habitatTypeId: string | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

/** One resolved stop: a route item joined to its habitat, in route order. */
export interface RouteStopView {
	readonly routeItemId: string;
	readonly habitatId: string;
	readonly ordinal: number;
	readonly position: number;
	readonly name: string;
	readonly description: string;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly directionsToNextItem: string | null;
	readonly hasLocation: boolean;
	/** True while the habitat row behind this stop is still resolving. */
	readonly isResolving: boolean;
}

/** A run of consecutive stops that share one address (the grouping cue). */
export interface RouteStopCluster {
	readonly key: string;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly stops: readonly RouteStopView[];
}

export type StopTone = RouteStopFeature['tone'];

export function stopTone(stop: {
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}): StopTone {
	if (stop.isInaccessible) {
		return 'inaccessible';
	}
	return stop.isActive ? 'default' : 'inactive';
}

/**
 * All habitat-typed routes for the active org, sorted by name.
 *
 * The sort moved into the query, which drops `localeCompare`'s
 * `sensitivity: 'base'` — so a route named "acme" now sorts after "Zone 4"
 * rather than beside "Acme". Route names in practice are codes and zone numbers;
 * if that stops being true this wants a case-folded column, not a JS sort.
 */
export function useHabitatRoutes(): {
	readonly routes: readonly RouteSummary[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ route: routes() })
				.where(({ route }) => eq(route.route_type, 'habitat'))
				.orderBy(({ route }) => route.route_name, 'asc')
				.select(({ route }) => ({ id: route.id, routeName: route.route_name })),
		[],
	);

	return { routes: result.data, isLoading: result.isLoading, isReady: result.isReady };
}

/**
 * Habitat-stop counts for every route, keyed by route id. Reads the org-scoped
 * `route_items` shape (the same on-demand collection the map preview subscribes to),
 * so counting all routes adds no extra round-trip.
 */
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
					.where(({ item }) => eq(item.entity_type, 'habitat'))
					.select(({ item }) => ({ routeId: item.route_id })),
		},
		[],
	);

	const stops = result.data;

	const countByRouteId = useMemo(() => {
		const map = new Map<string, number>();
		for (const stop of stops) {
			map.set(stop.routeId, (map.get(stop.routeId) ?? 0) + 1);
		}
		return map;
	}, [stops]);

	return { countByRouteId, isLoading: result.isLoading };
}

/**
 * The composed itinerary for a route: ordered stops, address clusters, and the
 * point features the map layer draws.
 *
 * ## One query, not three
 *
 * This read the route's items, then the habitats those items named, then the
 * addresses those habitats linked — each waiting on the render before it, and the
 * last two re-running whenever the id set moved. It is one join now. The planner
 * collects the join keys each side produces and asks the on-demand collections for
 * exactly those rows, which is the same three subsets minus two round trips
 * through React.
 *
 * Everything still resolves from live collection subsets rather than HTTP, so an
 * edit to a stop's habitat — its description, its linked address — streams back
 * without any manual invalidation.
 */
export function useRouteStops(routeId: string | null): {
	readonly stops: readonly RouteStopView[];
	readonly clusters: readonly RouteStopCluster[];
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
		},
		[routeId],
	);

	const rows = result.data;

	const stops = useMemo<RouteStopView[]>(
		() =>
			// The `ordinal` is the one thing the query cannot produce: it is the stop's
			// place in the ordered result, and a projection sees a row rather than the
			// sequence. `position` is the stored sort key and can have gaps, so it is
			// not the number a crew reads off the list.
			rows.map((row, index) => ({
				...row,
				ordinal: index + 1,
				name: row.name ?? `Habitat ${row.habitatId.slice(0, 8)}`,
				hasLocation: row.lat !== null && row.lng !== null,
				isResolving: row.resolvedHabitatId === undefined,
			})),
		[rows],
	);

	const clusters = useMemo(() => clusterByAddress(stops), [stops]);

	const features = useMemo<RouteStopFeature[]>(
		() =>
			stops
				.filter((stop) => stop.hasLocation)
				.map((stop) => ({
					id: stop.routeItemId,
					lng: stop.lng as number,
					lat: stop.lat as number,
					ordinal: stop.ordinal,
					tone: stopTone(stop),
				})),
		[stops],
	);

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

// --- editing helpers --------------------------------------------------------

const minSearchLength = 2;

/** Name/address habitat search for the add-stop picker (min 2 chars). */
export function useHabitatSearch(query: string): {
	readonly results: readonly HabitatSite[];
	readonly isFetching: boolean;
	readonly isTooShort: boolean;
} {
	const q = query.trim();
	const enabled = q.length >= minSearchLength;
	const result = useQuery({
		enabled,
		queryKey: ['route', 'habitat-search', q],
		queryFn: ({ signal }) => fetchHabitatSearch(q, signal),
		placeholderData: (previous) => previous,
		staleTime: 10_000,
	});

	return {
		results: enabled ? (result.data ?? []) : [],
		isFetching: enabled && result.isFetching,
		isTooShort: q.length > 0 && q.length < minSearchLength,
	};
}

async function fetchHabitatSearch(query: string, signal: AbortSignal): Promise<HabitatSite[]> {
	const url = new URL('/map/habitats/search', getServerUrl());
	url.searchParams.set('q', query);
	const response = await sessionFetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`Habitat search failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly habitats?: HabitatSite[] };
	return body.habitats ?? [];
}

/**
 * Update a habitat's description in place (the stop's own record, not the route
 * item). Writes go through the command endpoint; the on-demand habitat subset the
 * route reads then streams the change back, so no manual cache invalidation.
 */
export async function updateHabitatDescription(
	habitatId: string,
	description: string,
): Promise<void> {
	await patchHabitat(habitatId, { description }, 'Unable to save the description.');
}

/**
 * Link (or unlink, with `null`) the habitat behind a stop to an address book record.
 * Same PATCH endpoint as the description edit; the synced habitat/address subsets
 * reflect the new label without invalidation.
 */
export async function updateHabitatAddress(
	habitatId: string,
	addressId: string | null,
): Promise<void> {
	await patchHabitat(habitatId, { addressId }, 'Unable to update the linked address.');
}

async function patchHabitat(
	habitatId: string,
	body: Record<string, unknown>,
	fallbackError: string,
): Promise<void> {
	const response = await sessionFetch(
		new URL(`/larval-surveillance/habitats/${habitatId}`, getServerUrl()),
		{
			method: 'PATCH',
			credentials: 'include',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify(body),
		},
	);
	const result = (await response.json().catch(() => ({}))) as {
		readonly txid?: number;
		readonly reason?: string;
		readonly message?: string;
	};
	if (!response.ok || result.txid === undefined) {
		throw new Error(result.reason ?? result.message ?? fallbackError);
	}
}
