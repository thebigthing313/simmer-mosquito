import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import { insetPadding, type MapInset } from '../map/map-inset';

/** Close enough to read a record's surroundings without throwing away a closer view. */
const SELECTION_ZOOM = 14;
const FLY_DURATION_MS = 700;

/**
 * Centres the map on the selected record whenever the resolved selection moves.
 *
 * Ten explorers carried this effect. Half of them keyed it on the selected
 * object, which re-flies whenever a refetch hands back a new object for the
 * same record; keying on the coordinates is the version that does not.
 *
 * `inset` is what the page has floating over the map. Without it the record
 * lands in the centre of the canvas, which on a full-page map with a results
 * panel is behind the panel the reader just picked it from.
 */
export function useFlyToSelection(
	map: MapboxMap | null,
	selected: { readonly lat: number | null; readonly lng: number | null } | null | undefined,
	inset?: MapInset,
): void {
	const lat = selected?.lat ?? null;
	const lng = selected?.lng ?? null;
	const padding = insetPadding(0, inset);
	const paddingKey = `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: padding keyed by value.
	useEffect(() => {
		if (map === null || lat === null || lng === null) {
			return;
		}
		map.flyTo({
			center: [lng, lat],
			zoom: Math.max(map.getZoom(), SELECTION_ZOOM),
			duration: FLY_DURATION_MS,
			padding,
		});
	}, [map, lat, lng, paddingKey]);
}
