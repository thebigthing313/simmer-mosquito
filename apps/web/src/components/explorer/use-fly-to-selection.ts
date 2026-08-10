import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';

/** Close enough to read a record's surroundings without throwing away a closer view. */
const SELECTION_ZOOM = 14;
const FLY_DURATION_MS = 700;

/**
 * Centres the map on the selected record whenever the resolved selection moves.
 *
 * Ten explorers carried this effect. Half of them keyed it on the selected
 * object, which re-flies whenever a refetch hands back a new object for the
 * same record; keying on the coordinates is the version that does not.
 */
export function useFlyToSelection(
	map: MapboxMap | null,
	selected: { readonly lat: number | null; readonly lng: number | null } | null | undefined,
): void {
	const lat = selected?.lat ?? null;
	const lng = selected?.lng ?? null;

	useEffect(() => {
		if (map === null || lat === null || lng === null) {
			return;
		}
		map.flyTo({
			center: [lng, lat],
			zoom: Math.max(map.getZoom(), SELECTION_ZOOM),
			duration: FLY_DURATION_MS,
		});
	}, [map, lat, lng]);
}
