import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';

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
		map.fitBounds(
			[
				[bounds.west, bounds.south],
				[bounds.east, bounds.north],
			],
			{ padding: 80, maxZoom: 17, duration: 600 },
		);
		return;
	}
	map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
}
