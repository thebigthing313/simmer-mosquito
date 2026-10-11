import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { focusOnMap } from '../../components/map/map-camera';

/**
 * Flies to a station when it becomes focused, from either the list or the map,
 * as a `selection` focus (see `focusOnMap`).
 */
export function useFlyToStation(
	map: MapboxMap | null,
	focused: { readonly lat: number; readonly lng: number } | null,
): void {
	useEffect(() => {
		if (map === null || focused === null) {
			return;
		}
		focusOnMap(map, focused, { purpose: 'selection' });
	}, [map, focused]);
}
