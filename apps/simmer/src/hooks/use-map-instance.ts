import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapRef } from 'react-map-gl/mapbox';
import { useMapStore } from '@/src/stores/map-store';

/**
 * Hook that returns the react-map-gl MapRef and its loaded state.
 *
 * `mapRef` exposes safe camera methods (flyTo, easeTo, etc.) and read-only
 * queries (getBounds, getZoom, etc.).
 *
 * Use `mapRef.getMap()` when you need the underlying native mapbox-gl Map
 * instance for advanced operations not covered by the store.
 *
 * @example
 * ```tsx
 * const { mapRef, mapLoaded } = useMapInstance();
 * if (mapRef && mapLoaded) {
 *   const nativeMap = mapRef.getMap();
 *   nativeMap.addSource('my-source', { type: 'geojson', data: geojson });
 * }
 * ```
 */
export function useMapInstance(): {
	mapRef: MapRef | null;
	/** @deprecated Use `mapRef.getMap()` instead for the native map instance. */
	map: MapboxMap | null;
	mapLoaded: boolean;
} {
	const mapRef = useMapStore((s) => s.mapRef);
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	return {
		mapRef,
		map: mapRef?.getMap() ?? null,
		mapLoaded,
	};
}
