import type { RouteRow, TrapRow } from '@simmer-mosquito/sync';
import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { RouteStopFeature } from '../../../../components/map';
import { useCollectionRows } from '../../../../hooks/use-collection-rows';
import { webCollections } from '../../../../sync/webCollections';
import { trapDisplayName } from '../../-adult-display';

// Trap routes reuse the shared `routes` / `route_items` tables — a route with
// `routeType: 'trap'`, its stops `route_items` with `entityType: 'trap'`. `routes`
// is eager; `route_items` is on-demand (docs/sync.md), kept warm briefly so index
// → detail → edit hops reuse the subset.
const routeItemsGcTimeMs = 30_000;
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

/** All trap routes (eager), sorted by name. */
export function useTrapRoutes(): {
	readonly routes: readonly RouteRow[];
	readonly isReady: boolean;
	readonly isLoading: boolean;
} {
	const { rows, status } = useCollectionRows<RouteRow>(webCollections.routes);
	const routes = useMemo(
		() =>
			rows
				.filter((route) => route.routeType === 'trap')
				.sort((first, second) => first.routeName.localeCompare(second.routeName)),
		[rows],
	);
	return { routes, isReady: status === 'ready', isLoading: status !== 'ready' };
}

/** Stop counts per trap route, from the on-demand `route_items` subset. */
export function useRouteStopCounts(): {
	readonly countByRouteId: ReadonlyMap<string, number>;
	readonly isLoading: boolean;
} {
	const result = useLiveQuery({
		gcTime: routeItemsGcTimeMs,
		query: (query) =>
			query
				.from({ routeItem: webCollections.routeItems })
				.where(({ routeItem }) => eq(routeItem.entityType, 'trap'))
				.select(({ routeItem }) => ({ routeId: routeItem.routeId })),
	});

	const countByRouteId = useMemo(() => {
		const map = new Map<string, number>();
		for (const row of (result.data ?? []) as readonly { routeId: string }[]) {
			map.set(row.routeId, (map.get(row.routeId) ?? 0) + 1);
		}
		return map;
	}, [result.data]);

	return { countByRouteId, isLoading: !result.isReady };
}

interface RouteItemProjection {
	readonly id: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
}

/**
 * The ordered stops of one trap route, each item joined to its (eager) trap for
 * name + point geometry, plus the {@link RouteStopFeature}s the map layer draws.
 */
export function useRouteStops(routeId: string | null): {
	readonly stops: readonly RouteStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly itemCount: number;
	readonly isLoading: boolean;
} {
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);
	const trapById = useMemo(() => new Map(traps.map((trap) => [trap.id, trap])), [traps]);

	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ routeItem: webCollections.routeItems })
					.where(({ routeItem }) =>
						and(eq(routeItem.routeId, routeId ?? UNMATCHABLE_ID), eq(routeItem.entityType, 'trap')),
					)
					.orderBy(({ routeItem }) => routeItem.position, 'asc')
					.select(({ routeItem }) => ({
						id: routeItem.id,
						entityId: routeItem.entityId,
						position: routeItem.position,
						directionsToNextItem: routeItem.directionsToNextItem,
					})),
		},
		[routeId],
	);

	const items = (result.data ?? []) as readonly RouteItemProjection[];

	const stops = useMemo<readonly RouteStopView[]>(() => {
		return items.map((item, index) => {
			const trap = trapById.get(item.entityId);
			const hasLocation = trap !== undefined;
			return {
				routeItemId: item.id,
				trapId: item.entityId,
				ordinal: index + 1,
				position: item.position,
				name: trap === undefined ? `Trap ${item.entityId.slice(0, 8)}` : trapDisplayName(trap),
				isActive: trap?.isActive ?? true,
				lat: trap?.lat ?? null,
				lng: trap?.lng ?? null,
				hasLocation,
				directionsToNextItem: item.directionsToNextItem,
				isResolving: trap === undefined,
			};
		});
	}, [items, trapById]);

	const features = useMemo<readonly RouteStopFeature[]>(() => {
		const list: RouteStopFeature[] = [];
		for (const stop of stops) {
			if (stop.lat === null || stop.lng === null) {
				continue;
			}
			list.push({
				id: stop.routeItemId,
				lat: stop.lat,
				lng: stop.lng,
				ordinal: stop.ordinal,
				tone: stop.isActive ? 'default' : 'inactive',
			});
		}
		return list;
	}, [stops]);

	return { stops, features, itemCount: items.length, isLoading: !result.isReady };
}
