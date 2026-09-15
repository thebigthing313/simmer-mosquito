import { type BoundingBox, formatBoundingBox, isBoundingBox } from '@simmer-mosquito/mapping';
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

/**
 * The box as the `/map/*` list endpoints read one, or the whole world.
 *
 * Latitude is clamped, because a view past a pole is the same ground clamped
 * or not. Longitude is not: mapbox unprojects a camera across the antimeridian
 * unwrapped, west 170 to east 190, and clamping that to 170,180 drops the
 * eastern half of what the reader is looking at with nothing on screen to say
 * so. So a raw longitude outside the range collapses the box to the whole
 * world, which is a superset of the view, and a superset is wrong in the
 * direction a person can see (#933). `isBoundingBox` is the same rule the
 * server's `bbox` parser applies, so the two cannot disagree about what a box
 * is. It also asks `west <= east`, which `readCanvasBounds` already guarantees
 * by taking the min and the max, so no branch here answers that case.
 *
 * `isInView` in `map/use-map-extent-fit.ts` reasons about the same unwrapped camera
 * and does not share this: it asks whether an extent is on screen, and needs
 * the raw view to answer, since a whole-world box would put every extent in
 * view and skip a fit that was owed. This asks what box to send, and needs a
 * box the endpoint accepts.
 */
function normalizeBounds(bounds: BoundingBox): BoundingBox {
	const south = clamp(bounds.south, -90, 90);
	const north = clamp(bounds.north, -90, 90);
	const candidate = { east: bounds.east, north, south, west: bounds.west };
	return isBoundingBox(candidate) ? candidate : { east: 180, north, south, west: -180 };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
