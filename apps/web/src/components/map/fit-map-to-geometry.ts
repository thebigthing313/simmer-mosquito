import {
	type BoundingBox,
	boundsFromGeoJson,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { framingPadding } from './map-inset';

/**
 * Ease the map to frame `geometry`.
 *
 * A single position has no extent to fit, so it eases to centre instead and
 * keeps the zoom it is already at when that is closer in than 15.
 */
export function fitMapToGeometry(map: MapboxMap, geometry: GeoJsonGeometry): void {
	const bounds = boundsFromGeoJson(geometry);
	if (bounds === null) {
		return;
	}
	const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
	if (hasArea) {
		fitMapToBox(map, bounds, { margin: 80, maxZoom: 17, duration: 600 });
		return;
	}
	map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
}

/**
 * Fit the map to a box with area, `margin` px clear of the canvas padding on
 * every side, and leave the canvas padding on the map afterwards.
 */
export function fitMapToBox(
	map: MapboxMap,
	bounds: BoundingBox,
	{ margin, maxZoom, duration }: { margin: number; maxZoom: number; duration: number },
): void {
	map.fitBounds(
		[
			[bounds.west, bounds.south],
			[bounds.east, bounds.north],
		],
		{ ...framingPadding(map, margin), maxZoom, duration },
	);
}
