import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { focusOnMap } from '../../components/map/map-camera';
import { RAIL_HOLDS_MOVE } from './use-map-bounds-param';

/**
 * Centres the map on the selected record whenever its coordinates change, as a
 * `selection` focus (see `focusOnMap`). The canvas's viewport padding (see
 * `useMapPadding`) decides where on the canvas the record lands.
 *
 * `holdRail` marks the flight so `useMapBoundsParam` does not read it as a new
 * viewport, which leaves the rail listing what it listed before the pick.
 */
export function useFlyToSelection(
	map: MapboxMap | null,
	selected: { readonly lat: number | null; readonly lng: number | null } | null | undefined,
	holdRail = false,
): void {
	const lat = selected?.lat ?? null;
	const lng = selected?.lng ?? null;

	useEffect(() => {
		if (map === null || lat === null || lng === null) {
			return;
		}
		focusOnMap(
			map,
			{ lng, lat },
			{ purpose: 'selection', eventData: holdRail ? { [RAIL_HOLDS_MOVE]: true } : undefined },
		);
	}, [map, lat, lng, holdRail]);
}
