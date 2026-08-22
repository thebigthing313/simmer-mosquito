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
 *
 * Read off the canvas corners rather than `getBounds`, which subtracts the map's
 * viewport padding. A page with a results panel floating over its map sets that
 * padding, so `getBounds` would hand back only the strip beside the panel and
 * the list would drop every record behind it — measured at 215 records against
 * 129 on one Habitat viewport. Opening and closing a panel is not a change of
 * viewport, and must not be a change of result set.
 */
export function useMapBoundsParam(map: MapboxMap | null): string | null {
	const [bbox, setBbox] = useState<string | null>(null);

	useEffect(() => {
		if (map === null) {
			setBbox(null);
			return;
		}
		const update = () => {
			const next = readCanvasBounds(map);
			if (next === null) {
				return;
			}
			const candidate = formatBoundingBox(normalizeBounds(next));
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

/**
 * The whole canvas as a geographic box, padding and all.
 *
 * Unprojecting all four corners rather than two, for the same reason `getBounds`
 * does: under a bearing the visible region is not axis-aligned, and the answer
 * is the smallest box that holds it.
 */
function readCanvasBounds(map: MapboxMap): BoundingBox | null {
	const canvas = map.getCanvas();
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	if (width === 0 || height === 0) {
		return null;
	}

	const corners = [
		map.unproject([0, 0]),
		map.unproject([width, 0]),
		map.unproject([width, height]),
		map.unproject([0, height]),
	];

	const lngs = corners.map((corner) => corner.lng);
	const lats = corners.map((corner) => corner.lat);
	return {
		east: Math.max(...lngs),
		north: Math.max(...lats),
		south: Math.min(...lats),
		west: Math.min(...lngs),
	};
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
