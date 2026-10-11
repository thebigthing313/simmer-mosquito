import {
	type BoundingBox,
	boundsFromGeoJson,
	type GeoJsonGeometry,
	type LngLat,
	MAP_CLUSTER_UNTIL_ZOOM,
} from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { framingPadding, type MapInset } from './map-inset';

/** How close a frame lands on a target with no area: at least this zoom, or exactly it. */
type PointZoom = { readonly atLeast: number } | { readonly exactly: number };

interface FrameSettings {
	/** Pixels clear of the canvas padding on every side. */
	readonly margin: number;
	/** The closest a fit lands, so a small box does not fill the map at street level. */
	readonly maxZoom: number;
	readonly pointZoom: PointZoom;
	/** Milliseconds for an animated frame, or undefined for Mapbox's own default. */
	readonly duration: number | undefined;
}

/**
 * What a frame is for, and the numbers each purpose frames with.
 *
 * `record` is one record's own shape, on a form, a draw part or a detail card.
 * `context` is a record with what surrounds it, which wants a tighter margin
 * and a quicker move. `collection` is a set of records, and lands a lone record
 * at the zoom clustering stops, so it is drawn as itself and never inside a
 * cluster of its neighbours. `cluster` stops at that same zoom, since any closer
 * lands on a plain tile showing the same records.
 */
export const FRAME_PURPOSES = {
	record: { margin: 64, maxZoom: 17, pointZoom: { atLeast: 16 }, duration: 600 },
	context: { margin: 56, maxZoom: 17, pointZoom: { atLeast: 16 }, duration: 400 },
	collection: {
		margin: 56,
		maxZoom: 16,
		pointZoom: { atLeast: MAP_CLUSTER_UNTIL_ZOOM },
		duration: 600,
	},
	cluster: {
		margin: 48,
		maxZoom: MAP_CLUSTER_UNTIL_ZOOM,
		pointZoom: { exactly: MAP_CLUSTER_UNTIL_ZOOM },
		duration: undefined,
	},
} as const satisfies Record<string, FrameSettings>;

export type FramePurpose = keyof typeof FRAME_PURPOSES;

/**
 * What a focus is for. `selection` follows a record picked from a list or a
 * map; `place` goes to a spot the reader asked for, which can be anywhere.
 */
export const FOCUS_PURPOSES = {
	selection: { zoomFloor: 14, duration: 700 },
	place: { zoomFloor: 15, duration: 1100 },
} as const satisfies Record<string, { readonly zoomFloor: number; readonly duration: number }>;

export type FocusPurpose = keyof typeof FOCUS_PURPOSES;

/**
 * Frame a box or a geometry on the map.
 *
 * A target with no finite bounds moves nothing. One with no area eases to its
 * centre at the purpose's point zoom, and anything else fits with the purpose's
 * margin and zoom cap. The padding is the canvas's own plus the margin, and it
 * is gone once the move ends; `inset` stands in for the canvas's padding when
 * the caller knows it before the canvas has written it. `animate: false` lands
 * at once.
 */
export function frameOnMap(
	map: MapboxMap,
	target: BoundingBox | GeoJsonGeometry | null,
	options: {
		readonly purpose: FramePurpose;
		readonly animate: boolean;
		readonly inset?: MapInset | undefined;
	},
): void {
	const bounds = finiteBounds(target);
	if (bounds === null) {
		return;
	}
	const settings: FrameSettings = FRAME_PURPOSES[options.purpose];
	const duration = options.animate ? settings.duration : 0;
	const camera = {
		...framingPadding(map, settings.margin, options.inset),
		...(duration === undefined ? {} : { duration }),
	};
	if (bounds.west === bounds.east && bounds.south === bounds.north) {
		map.easeTo({
			...camera,
			center: [bounds.west, bounds.south],
			zoom: pointZoom(map, settings.pointZoom),
		});
		return;
	}
	map.fitBounds(
		[
			[bounds.west, bounds.south],
			[bounds.east, bounds.north],
		],
		{ ...camera, maxZoom: settings.maxZoom },
	);
}

/**
 * Fly to a point, closing in to the purpose's zoom floor and keeping a closer
 * view. It passes no padding, so the point lands in the middle of the part of
 * the canvas the reader can see. `eventData` reaches every event the flight
 * fires.
 */
export function focusOnMap(
	map: MapboxMap,
	point: LngLat,
	options: { readonly purpose: FocusPurpose; readonly eventData?: object | undefined },
): void {
	const { zoomFloor, duration } = FOCUS_PURPOSES[options.purpose];
	map.flyTo(
		{
			center: [point.lng, point.lat],
			zoom: Math.max(map.getZoom(), zoomFloor),
			duration,
			// Not `essential`: under reduced motion Mapbox jumps instead of flying.
		},
		options.eventData,
	);
}

function finiteBounds(target: BoundingBox | GeoJsonGeometry | null): BoundingBox | null {
	if (target === null) {
		return null;
	}
	const bounds = 'type' in target ? boundsFromGeoJson(target) : target;
	if (bounds === null) {
		return null;
	}
	const { west, south, east, north } = bounds;
	return [west, south, east, north].every(Number.isFinite) ? bounds : null;
}

function pointZoom(map: MapboxMap, zoom: PointZoom): number {
	return 'exactly' in zoom ? zoom.exactly : Math.max(map.getZoom(), zoom.atLeast);
}
