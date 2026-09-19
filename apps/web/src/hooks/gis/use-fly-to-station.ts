import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';

/** Flies to a station when it becomes focused, from either the list or the map. */
export function useFlyToStation(
	map: MapboxMap | null,
	focused: { readonly lat: number; readonly lng: number } | null,
): void {
	useEffect(() => {
		if (map === null || focused === null) {
			return;
		}
		map.flyTo({
			center: [focused.lng, focused.lat],
			zoom: Math.max(map.getZoom(), 12),
			duration: 600,
		});
	}, [map, focused]);
}
