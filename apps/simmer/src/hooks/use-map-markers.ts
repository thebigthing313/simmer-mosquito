import { useCallback, useMemo } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { MapMarker, LngLat } from '@/src/stores/map-store';

/**
 * Hook for managing map markers.
 *
 * @example
 * ```tsx
 * const { markers, addMarker, removeMarker } = useMapMarkers();
 * addMarker({ id: 'trap-1', lngLat: { lng: -95, lat: 37 }, color: '#10b981' });
 * ```
 */
export function useMapMarkers() {
	const markersMap = useMapStore((s) => s.markers);
	const addMarker = useMapStore((s) => s.addMarker);
	const addMarkers = useMapStore((s) => s.addMarkers);
	const updateMarker = useMapStore((s) => s.updateMarker);
	const removeMarker = useMapStore((s) => s.removeMarker);
	const removeAllMarkers = useMapStore((s) => s.removeAllMarkers);
	const setMarkerVisibility = useMapStore((s) => s.setMarkerVisibility);

	/** All markers as an array */
	const markers = useMemo(() => Array.from(markersMap.values()), [markersMap]);

	/** Only visible markers */
	const visibleMarkers = useMemo(
		() => markers.filter((m) => m.visible !== false),
		[markers],
	);

	/** Find a marker by ID */
	const getMarker = useCallback(
		(id: string): MapMarker | undefined => markersMap.get(id),
		[markersMap],
	);

	/** Replace all markers at once */
	const setMarkers = useCallback(
		(newMarkers: MapMarker[]) => {
			removeAllMarkers();
			addMarkers(newMarkers);
		},
		[removeAllMarkers, addMarkers],
	);

	/** Get the nearest marker to a point */
	const getNearestMarker = useCallback(
		(point: LngLat): MapMarker | null => {
			if (markers.length === 0) return null;
			let nearest = markers[0];
			let minDist = Number.POSITIVE_INFINITY;
			for (const m of markers) {
				const d = Math.hypot(m.lngLat.lng - point.lng, m.lngLat.lat - point.lat);
				if (d < minDist) {
					minDist = d;
					nearest = m;
				}
			}
			return nearest;
		},
		[markers],
	);

	return {
		markers,
		visibleMarkers,
		markerCount: markers.length,
		getMarker,
		getNearestMarker,
		addMarker,
		addMarkers,
		setMarkers,
		updateMarker,
		removeMarker,
		removeAllMarkers,
		setMarkerVisibility,
	};
}
