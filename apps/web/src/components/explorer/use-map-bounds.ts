import { type BoundingBox, formatBoundingBox } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState } from 'react';

/**
 * The current viewport as the `bbox` param the `/map/*` list endpoints read, or
 * `null` until the map has one.
 *
 * The three viewport-driven explorers each held a copy of this, its clamping,
 * and its listener teardown. It hands back the formatted string rather than the
 * box because that is all any caller ever wanted: the same value keys the query
 * and goes on the URL, so an equivalent viewport cannot key two requests.
 */
export function useMapBoundsParam(map: MapboxMap | null): string | null {
	const [bbox, setBbox] = useState<string | null>(null);

	useEffect(() => {
		if (map === null) {
			setBbox(null);
			return;
		}
		const update = () => {
			const next = map.getBounds();
			if (next === null) {
				return;
			}
			const candidate = formatBoundingBox(
				normalizeBounds({
					east: next.getEast(),
					north: next.getNorth(),
					south: next.getSouth(),
					west: next.getWest(),
				}),
			);
			setBbox((current) => (current === candidate ? current : candidate));
		};

		update();
		map.on('moveend', update);
		map.on('zoomend', update);
		map.on('resize', update);
		return () => {
			map.off('moveend', update);
			map.off('zoomend', update);
			map.off('resize', update);
		};
	}, [map]);

	return bbox;
}

/** Clamp to valid lng/lat and collapse a world-spanning view to a single box. */
function normalizeBounds(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const span = bounds.east - bounds.west;
	if (!Number.isFinite(span) || span >= 360) {
		return { east: 180, north, south, west: -180 };
	}
	const west = clamp(bounds.west, -180, 180);
	const east = clamp(bounds.east, -180, 180);
	if (west > east) {
		return { east: 180, north, south, west: -180 };
	}
	return { east, north, south, west };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
