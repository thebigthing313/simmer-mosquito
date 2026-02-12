import { useCallback, useMemo } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { MapPolygon } from '@/src/stores/map-store';

/**
 * Hook for managing map polygons.
 *
 * @example
 * ```tsx
 * const { addPolygon, removePolygon } = useMapPolygons();
 * addPolygon({
 *   id: 'region-1',
 *   coordinates: [[[-74, 40], [-73, 40], [-73, 41], [-74, 41], [-74, 40]]],
 *   fillColor: '#10b981',
 * });
 * ```
 */
export function useMapPolygons() {
	const polygonsMap = useMapStore((s) => s.polygons);
	const addPolygon = useMapStore((s) => s.addPolygon);
	const addPolygons = useMapStore((s) => s.addPolygons);
	const updatePolygon = useMapStore((s) => s.updatePolygon);
	const removePolygon = useMapStore((s) => s.removePolygon);
	const removeAllPolygons = useMapStore((s) => s.removeAllPolygons);
	const setPolygonVisibility = useMapStore((s) => s.setPolygonVisibility);

	const polygons = useMemo(() => Array.from(polygonsMap.values()), [polygonsMap]);

	const visiblePolygons = useMemo(
		() => polygons.filter((p) => p.visible !== false),
		[polygons],
	);

	const getPolygon = useCallback(
		(id: string): MapPolygon | undefined => polygonsMap.get(id),
		[polygonsMap],
	);

	const setPolygons = useCallback(
		(newPolygons: MapPolygon[]) => {
			removeAllPolygons();
			addPolygons(newPolygons);
		},
		[removeAllPolygons, addPolygons],
	);

	return {
		polygons,
		visiblePolygons,
		polygonCount: polygons.length,
		getPolygon,
		addPolygon,
		addPolygons,
		setPolygons,
		updatePolygon,
		removePolygon,
		removeAllPolygons,
		setPolygonVisibility,
	};
}
