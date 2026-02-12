import type { Map as MapboxMap } from 'mapbox-gl';
import { useMapStore } from '@/src/stores/map-store';

/**
 * Hook that returns the raw Mapbox GL JS `map` instance and its loaded state.
 *
 * Use this only when you need direct access to the map instance for advanced
 * operations not covered by the store.
 *
 * @example
 * ```tsx
 * const { map, mapLoaded } = useMapInstance();
 * if (map && mapLoaded) {
 *   map.addSource('my-source', { type: 'geojson', data: geojson });
 * }
 * ```
 */
export function useMapInstance(): {
	map: MapboxMap | null;
	mapLoaded: boolean;
} {
	const map = useMapStore((s) => s.map);
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	return { map, mapLoaded };
}
