import type { AddressRow, HabitatRow, RouteItemRow, RouteRow } from '@simmer-mosquito/sync';
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../../auth';
import type { RouteStopFeature } from '../../../components/map';
import { webCollections } from '../../../sync/webCollections';

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

/** All habitat-typed routes for the active org, sorted by name. */
export function useHabitatRoutes(): {
	readonly routes: readonly RouteRow[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ route: webCollections.routes })
				.where(({ route }) => eq(route.routeType, 'habitat')),
		[],
	);

	const routes = useMemo(() => {
		const rows = (result.data ?? []) as readonly RouteRow[];
		return [...rows].sort((first, second) =>
			first.routeName.localeCompare(second.routeName, undefined, { sensitivity: 'base' }),
		);
	}, [result.data]);

	return { routes, isLoading: result.isLoading, isReady: result.isReady };
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
					.from({ item: webCollections.routeItems })
					.where(({ item }) => eq(item.entityType, 'habitat')),
		},
		[],
	);

	const countByRouteId = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of (result.data ?? []) as readonly RouteItemRow[]) {
			map.set(item.routeId, (map.get(item.routeId) ?? 0) + 1);
		}
		return map;
	}, [result.data]);

	return { countByRouteId, isLoading: result.isLoading };
}

/** A single habitat route by id (or null while unresolved). */
export function useHabitatRoute(routeId: string | null): RouteRow | null {
	const { routes } = useHabitatRoutes();
	return useMemo(
		() => (routeId === null ? null : (routes.find((route) => route.id === routeId) ?? null)),
		[routes, routeId],
	);
}

function useRouteItems(routeId: string | null): {
	readonly items: readonly RouteItemRow[];
	readonly isLoading: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.routeItems })
					// An unmatchable id keeps the hook order stable while no route is selected.
					.where(({ item }) => eq(item.routeId, routeId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc'),
		},
		[routeId],
	);

	const items = useMemo(() => {
		const rows = (result.data ?? []) as readonly RouteItemRow[];
		return rows.filter((row) => row.entityType === 'habitat');
	}, [result.data]);

	return { items, isLoading: routeId !== null && result.isLoading };
}

/**
 * Resolve the habitats behind a set of route stops, each with its address label,
 * as live on-demand subsets. `habitats` and `addresses` are on-demand collections
 * (docs/sync.md): the `IN` predicates load exactly the referenced rows and keep
 * streaming, so an edit to a stop's habitat (description/address) shows up without
 * any manual invalidation. Centroid `lat`/`lng` ride the synced habitat row, so
 * pins no longer need the `/map/habitats/by-ids` fetch.
 */
function useHabitatSites(ids: readonly string[]): {
	readonly byId: ReadonlyMap<string, HabitatSite>;
	readonly isLoading: boolean;
} {
	// A stable, order-independent key so panning selection doesn't re-run the query.
	const idsKey = useMemo(() => [...ids].sort().join(','), [ids]);
	const habitatIds = ids.length > 0 ? [...ids] : [UNMATCHABLE_ID];

	const habitatResult = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) => inArray(habitat.id, habitatIds)),
		},
		[idsKey],
	);

	const habitats = useMemo(
		() => (habitatResult.data ?? []) as readonly HabitatRow[],
		[habitatResult.data],
	);

	// The distinct address book records those habitats link to — a second bounded
	// subset that supplies the cluster label (`address.displayName`).
	const addressIds = useMemo(() => {
		const set = new Set<string>();
		for (const habitat of habitats) {
			if (habitat.addressId !== null) {
				set.add(habitat.addressId);
			}
		}
		return [...set];
	}, [habitats]);
	const addressKey = addressIds.join(',');
	const addressQueryIds = addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID];

	const addressResult = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => inArray(address.id, addressQueryIds)),
		},
		[addressKey],
	);

	const addressNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const address of (addressResult.data ?? []) as readonly AddressRow[]) {
			map.set(address.id, address.displayName);
		}
		return map;
	}, [addressResult.data]);

	const byId = useMemo(() => {
		const map = new Map<string, HabitatSite>();
		for (const habitat of habitats) {
			map.set(habitat.id, {
				id: habitat.id,
				habitatName: habitat.habitatName,
				description: habitat.description,
				lat: habitat.lat,
				lng: habitat.lng,
				addressId: habitat.addressId,
				addressDisplayName:
					habitat.addressId === null ? null : (addressNameById.get(habitat.addressId) ?? null),
				habitatTypeId: habitat.habitatTypeId,
				isActive: habitat.isActive,
				isInaccessible: habitat.isInaccessible,
			});
		}
		return map;
	}, [habitats, addressNameById]);

	return { byId, isLoading: ids.length > 0 && habitatResult.isLoading };
}

/**
 * The composed itinerary for a route: ordered stops (item joined to habitat),
 * address clusters, and the point features the map layer draws. Route items,
 * habitats, and addresses all sync on-demand — the stops resolve entirely from
 * live collection subsets (no HTTP), so edits reflect without invalidation.
 */
export function useRouteStops(routeId: string | null): {
	readonly stops: readonly RouteStopView[];
	readonly clusters: readonly RouteStopCluster[];
	readonly features: readonly RouteStopFeature[];
	readonly itemCount: number;
	readonly isLoading: boolean;
} {
	const { items, isLoading: itemsLoading } = useRouteItems(routeId);
	const ids = useMemo(() => items.map((item) => item.entityId), [items]);
	const { byId, isLoading: sitesLoading } = useHabitatSites(ids);

	const stops = useMemo<RouteStopView[]>(
		() =>
			items.map((item, index) => {
				const site = byId.get(item.entityId);
				const lat = site?.lat ?? null;
				const lng = site?.lng ?? null;
				return {
					routeItemId: item.id,
					habitatId: item.entityId,
					ordinal: index + 1,
					position: item.position,
					name: site?.habitatName?.trim() || `Habitat ${item.entityId.slice(0, 8)}`,
					description: site?.description ?? '',
					habitatTypeId: site?.habitatTypeId ?? null,
					addressId: site?.addressId ?? null,
					addressLabel: site?.addressDisplayName ?? null,
					lat,
					lng,
					isActive: site?.isActive ?? true,
					isInaccessible: site?.isInaccessible ?? false,
					directionsToNextItem: item.directionsToNextItem,
					hasLocation: lat !== null && lng !== null,
					isResolving: site === undefined,
				};
			}),
		[items, byId],
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
		itemCount: items.length,
		isLoading: itemsLoading || sitesLoading,
	};
}

/** Group consecutive stops that share a non-null address into one cluster. */
export function clusterByAddress(stops: readonly RouteStopView[]): RouteStopCluster[] {
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

/** SW/NE bounds covering every located stop, or null when none are mapped. */
export function boundsOfStops(
	stops: readonly RouteStopView[],
): [[number, number], [number, number]] | null {
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	let count = 0;

	for (const stop of stops) {
		if (!stop.hasLocation) {
			continue;
		}
		const lng = stop.lng as number;
		const lat = stop.lat as number;
		west = Math.min(west, lng);
		east = Math.max(east, lng);
		south = Math.min(south, lat);
		north = Math.max(north, lat);
		count += 1;
	}

	return count === 0
		? null
		: [
				[west, south],
				[east, north],
			];
}

// --- editing helpers --------------------------------------------------------

export type RoutePlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly routeItemId: string }
	| { readonly kind: 'after'; readonly routeItemId: string };

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
	const response = await fetch(url, { credentials: 'include', signal });
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
	const response = await fetch(
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

/** Reorder route items server-side via the dedicated move endpoint. */
export async function moveRouteItems(
	routeId: string,
	routeItemIds: readonly string[],
	placement: RoutePlacement,
): Promise<void> {
	const response = await fetch(
		new URL(`/field-work/routes/${routeId}/move-items`, getServerUrl()),
		{
			method: 'POST',
			credentials: 'include',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ routeItemIds: [...routeItemIds], placement }),
		},
	);
	const result = (await response.json().catch(() => ({}))) as {
		readonly txid?: number;
		readonly reason?: string;
		readonly message?: string;
	};
	if (!response.ok || result.txid === undefined) {
		throw new Error(result.reason ?? result.message ?? 'Unable to reorder the route.');
	}
}
