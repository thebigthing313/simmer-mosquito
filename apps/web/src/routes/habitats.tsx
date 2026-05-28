import type { BoundingBox } from '@simmer-mosquito/mapping';
import { formatBoundingBox } from '@simmer-mosquito/mapping';
import type { HabitatDisplayRow, HabitatTypeRow } from '@simmer-mosquito/sync';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import { getServerUrl } from '../auth';
import { MapView } from '../map';
import { createHabitatTileSource, type HabitatTileFilters } from '../map/styles';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

export type HabitatStatusFilter = 'all' | 'active' | 'inactive';
export type HabitatAccessFilter = 'all' | 'accessible' | 'inaccessible';

export interface HabitatFilters {
	readonly status: HabitatStatusFilter;
	readonly access: HabitatAccessFilter;
	readonly habitatTypeId: string;
}

export interface VisibleHabitat {
	readonly row: HabitatDisplayRow;
	readonly typeName: string;
}

export interface GeoJsonPointGeometry {
	readonly type: 'Point';
	readonly coordinates: readonly [number, number];
}

export interface HabitatsLayoutContextValue {
	readonly bounds: BoundingBox | null;
	readonly filters: HabitatFilters;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly onFiltersChange: (filters: HabitatFilters) => void;
	readonly requestMapPoint: (options?: MapPointDrawOptions) => Promise<GeoJsonPointGeometry>;
	readonly visibleHabitats: readonly VisibleHabitat[];
}

export interface MapPointDrawOptions {
	readonly prompt?: string;
}

const initialFilters: HabitatFilters = {
	access: 'all',
	habitatTypeId: 'all',
	status: 'active',
};

const defaultHabitatsLayoutContext: HabitatsLayoutContextValue = {
	bounds: null,
	filters: initialFilters,
	habitatTypes: [],
	onFiltersChange: ignoreFiltersChange,
	requestMapPoint: rejectMapPointRequest,
	visibleHabitats: [],
};

interface HabitatsLayoutContextStore {
	snapshot: HabitatsLayoutContextValue;
	readonly listeners: Set<() => void>;
}

const habitatsLayoutContextStoreKey = '__simmerMosquitoHabitatsLayoutContextStore';
type HabitatsLayoutContextGlobal = typeof globalThis & {
	[habitatsLayoutContextStoreKey]?: HabitatsLayoutContextStore;
};

const habitatsLayoutContextGlobal = globalThis as HabitatsLayoutContextGlobal;
const habitatsLayoutContextStore = getGlobalHabitatsLayoutContextStore();

export const Route = createFileRoute('/habitats')({
	component: HabitatsLayoutRoute,
});

export function useHabitatsLayoutContext(): HabitatsLayoutContextValue {
	return useSyncExternalStore(
		subscribeToHabitatsLayoutContext,
		getHabitatsLayoutContextSnapshot,
		getHabitatsLayoutContextSnapshot,
	);
}

function getGlobalHabitatsLayoutContextStore(): HabitatsLayoutContextStore {
	const existingStore = habitatsLayoutContextGlobal[habitatsLayoutContextStoreKey];
	if (existingStore !== undefined) {
		return existingStore;
	}

	const store = {
		listeners: new Set<() => void>(),
		snapshot: defaultHabitatsLayoutContext,
	};
	habitatsLayoutContextGlobal[habitatsLayoutContextStoreKey] = store;
	return store;
}

function HabitatsLayoutRoute() {
	const [filters, setFilters] = useState<HabitatFilters>(initialFilters);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [pointDrawRequest, setPointDrawRequest] = useState<PointDrawRequest | null>(null);
	const bounds = useMapBounds(map);
	const { rows: habitatRows } = useVisibleHabitatRows(bounds, filters);
	const { rows: habitatTypes } = useCollectionRows(webCollections.habitatTypes);
	const tileFilters = useMemo(() => toTileFilters(filters), [filters]);
	const habitatSource = useMemo(
		() => createHabitatTileSource({ filters: tileFilters }),
		[tileFilters],
	);
	const typeNameById = useMemo(() => {
		const names = new Map<string, string>();
		for (const row of habitatTypes) {
			names.set(row.id, row.name);
		}
		return names;
	}, [habitatTypes]);
	const visibleHabitats = useMemo(
		() =>
			habitatRows.map((row) => ({
				row,
				typeName:
					row.habitatTypeId === null
						? 'Unassigned type'
						: (typeNameById.get(row.habitatTypeId) ?? 'Unknown type'),
			})),
		[habitatRows, typeNameById],
	);
	const handleMapReady = useCallback((nextMap: MapboxMap) => {
		setMap(nextMap);
	}, []);
	const requestMapPoint = useCallback(
		(options: MapPointDrawOptions = {}) =>
			new Promise<GeoJsonPointGeometry>((resolve, reject) => {
				if (map === null) {
					reject(new Error('The map is not ready yet.'));
					return;
				}

				setPointDrawRequest((currentRequest) => {
					currentRequest?.reject(new Error('A new map drawing request replaced this one.'));
					return {
						id: crypto.randomUUID(),
						prompt: options.prompt ?? 'Click the map to place a point.',
						reject,
						resolve,
					};
				});
			}),
		[map],
	);
	const contextValue = useMemo(
		(): HabitatsLayoutContextValue => ({
			bounds,
			filters,
			habitatTypes,
			onFiltersChange: setFilters,
			requestMapPoint,
			visibleHabitats,
		}),
		[bounds, filters, habitatTypes, requestMapPoint, visibleHabitats],
	);

	useLayoutEffect(() => {
		setHabitatsLayoutContextSnapshot(contextValue);
	}, [contextValue]);

	useEffect(() => {
		return () => {
			setHabitatsLayoutContextSnapshot(defaultHabitatsLayoutContext);
		};
	}, []);

	useMapPointDrawRequest(map, pointDrawRequest, setPointDrawRequest);

	return (
		<div className="h-full min-h-0 overflow-hidden">
			<section className="grid h-full min-h-0 grid-cols-[minmax(420px,1fr)_minmax(360px,0.44fr)] gap-4 overflow-hidden max-[1120px]:grid-cols-1">
				<div className="relative min-h-0 overflow-hidden rounded-md border border-border/40 bg-card">
					<HabitatMap
						className="rounded-none border-0"
						onMapReady={handleMapReady}
						source={habitatSource}
					/>
					{pointDrawRequest === null ? null : (
						<div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md border border-border/60 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
							{pointDrawRequest.prompt}
						</div>
					)}
				</div>
				<Card
					variant="surface"
					className="flex min-h-0 flex-col overflow-hidden border border-border/40"
				>
					<Outlet />
				</Card>
			</section>
		</div>
	);
}

function ignoreFiltersChange(_filters: HabitatFilters): void {}

function rejectMapPointRequest(): Promise<GeoJsonPointGeometry> {
	return Promise.reject(new Error('The habitats map is not ready yet.'));
}

interface PointDrawRequest {
	readonly id: string;
	readonly prompt: string;
	readonly resolve: (point: GeoJsonPointGeometry) => void;
	readonly reject: (error: Error) => void;
}

function useMapPointDrawRequest(
	map: MapboxMap | null,
	request: PointDrawRequest | null,
	setRequest: (request: PointDrawRequest | null) => void,
): void {
	useEffect(() => {
		if (map === null || request === null) {
			return;
		}

		const activeRequest = request;
		const canvas = map.getCanvas();
		const previousCursor = canvas.style.cursor;
		canvas.style.cursor = 'crosshair';

		function handleClick(event: MapMouseEvent) {
			activeRequest.resolve({
				type: 'Point',
				coordinates: [event.lngLat.lng, event.lngLat.lat],
			});
			setRequest(null);
		}

		map.once('click', handleClick);

		return () => {
			canvas.style.cursor = previousCursor;
			map.off('click', handleClick);
		};
	}, [map, request, setRequest]);
}

function subscribeToHabitatsLayoutContext(listener: () => void): () => void {
	habitatsLayoutContextStore.listeners.add(listener);
	return () => {
		habitatsLayoutContextStore.listeners.delete(listener);
	};
}

function getHabitatsLayoutContextSnapshot(): HabitatsLayoutContextValue {
	return habitatsLayoutContextStore.snapshot;
}

function setHabitatsLayoutContextSnapshot(nextSnapshot: HabitatsLayoutContextValue): void {
	habitatsLayoutContextStore.snapshot = nextSnapshot;
	for (const listener of habitatsLayoutContextStore.listeners) {
		listener();
	}
}

function HabitatMap({
	className,
	onMapReady,
	source,
}: {
	readonly className?: string;
	readonly onMapReady: (map: MapboxMap) => void;
	readonly source: ReturnType<typeof createHabitatTileSource>;
}) {
	return (
		<MapView
			className={cn('min-h-0', className)}
			onMapReady={onMapReady}
			reuseKey="habitats-map"
			vectorTileSources={[source]}
		/>
	);
}

function useMapBounds(map: MapboxMap | null): BoundingBox | null {
	const [bounds, setBounds] = useState<BoundingBox | null>(null);

	useEffect(() => {
		if (map === null) {
			setBounds(null);
			return;
		}

		const activeMap = map;
		function updateBounds() {
			const nextBounds = activeMap.getBounds();
			if (nextBounds === null) {
				return;
			}

			const updatedBounds = {
				east: nextBounds.getEast(),
				north: nextBounds.getNorth(),
				south: nextBounds.getSouth(),
				west: nextBounds.getWest(),
			};
			setBounds((currentBounds) =>
				currentBounds !== null &&
				formatBoundingBox(normalizeMapBoundsForQuery(currentBounds)) ===
					formatBoundingBox(normalizeMapBoundsForQuery(updatedBounds))
					? currentBounds
					: updatedBounds,
			);
		}

		updateBounds();
		activeMap.on('moveend', updateBounds);
		activeMap.on('zoomend', updateBounds);
		activeMap.on('resize', updateBounds);

		return () => {
			activeMap.off('moveend', updateBounds);
			activeMap.off('zoomend', updateBounds);
			activeMap.off('resize', updateBounds);
		};
	}, [map]);

	return bounds;
}

function useVisibleHabitatRows(
	bounds: BoundingBox | null,
	filters: HabitatFilters,
): {
	readonly rows: readonly HabitatDisplayRow[];
} {
	const queryBounds = bounds === null ? null : normalizeMapBoundsForQuery(bounds);
	const bbox = queryBounds === null ? null : formatBoundingBox(queryBounds);
	const { data } = useQuery({
		queryKey: ['habitats', 'visible', bbox, filters.status, filters.access, filters.habitatTypeId],
		queryFn: ({ signal }) => fetchVisibleHabitatRows(queryBounds, filters, signal),
		placeholderData: (previousRows) => previousRows ?? [],
	});

	return { rows: data ?? [] };
}

async function fetchVisibleHabitatRows(
	bounds: BoundingBox | null,
	filters: HabitatFilters,
	signal: AbortSignal,
): Promise<readonly HabitatDisplayRow[]> {
	if (bounds === null) {
		return [];
	}

	const url = new URL('/map/habitats', getServerUrl());
	url.searchParams.set('bbox', formatBoundingBox(bounds));
	url.searchParams.set('limit', '50');

	const tileFilters = toTileFilters(filters);
	if (tileFilters.isActive !== undefined) {
		url.searchParams.set('isActive', String(tileFilters.isActive));
	}
	if (tileFilters.isInaccessible !== undefined) {
		url.searchParams.set('isInaccessible', String(tileFilters.isInaccessible));
	}
	if (tileFilters.habitatTypeId !== undefined) {
		url.searchParams.set('habitatTypeId', tileFilters.habitatTypeId.join(','));
	}

	const response = await fetch(url, {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		throw new Error(`Habitats request failed with ${response.status}`);
	}

	const body = (await response.json()) as { readonly habitats?: readonly HabitatDisplayRow[] };
	return body.habitats ?? [];
}

function normalizeMapBoundsForQuery(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const span = bounds.east - bounds.west;

	if (!Number.isFinite(span) || span >= 360) {
		return {
			east: 180,
			north,
			south,
			west: -180,
		};
	}

	const west = clamp(bounds.west, -180, 180);
	const east = clamp(bounds.east, -180, 180);

	if (west > east) {
		return {
			east: 180,
			north,
			south,
			west: -180,
		};
	}

	return {
		east,
		north,
		south,
		west,
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function toTileFilters(filters: HabitatFilters): HabitatTileFilters {
	return {
		...(filters.status === 'all' ? {} : { isActive: filters.status === 'active' }),
		...(filters.access === 'all' ? {} : { isInaccessible: filters.access === 'inaccessible' }),
		...(filters.habitatTypeId === 'all' ? {} : { habitatTypeId: [filters.habitatTypeId] }),
	};
}
