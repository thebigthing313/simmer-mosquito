import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { RAIL_HOLDS_MOVE } from './use-map-bounds-param';

/** Close enough to read a record's surroundings without throwing away a closer view. */
const SELECTION_ZOOM = 14;
const FLY_DURATION_MS = 700;

/**
 * Centres the map on the selected record whenever its coordinates change.
 *
 * Zooms in to `SELECTION_ZOOM` when the map is further out and keeps a closer
 * view otherwise. The canvas's viewport padding (see `useMapPadding`) decides
 * where on the canvas the record lands.
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
		map.flyTo(
			{
				center: [lng, lat],
				zoom: Math.max(map.getZoom(), SELECTION_ZOOM),
				duration: FLY_DURATION_MS,
			},
			holdRail ? { [RAIL_HOLDS_MOVE]: true } : undefined,
		);
	}, [map, lat, lng, holdRail]);
}
