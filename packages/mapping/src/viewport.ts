import type { BoundingBox, LngLat } from './geometry.js';

export const SINGLE_FEATURE_ZOOM = 17;

export const DEFAULT_MAP_CAMERA: MapCamera = {
	center: { lng: -95.7129, lat: 37.0902 },
	zoom: 4,
	bearing: 0,
	pitch: 0,
};

export interface MapCamera {
	readonly center: LngLat;
	readonly zoom: number;
	readonly bearing: number;
	readonly pitch: number;
}

export interface ViewportPadding {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export interface MapViewport extends MapCamera {
	readonly bounds: BoundingBox | null;
	readonly width: number;
	readonly height: number;
}

export function isMapCamera(value: unknown): value is MapCamera {
	if (!isRecord(value)) return false;
	if (!isLngLatRecord(value.center)) return false;
	return isFiniteNumber(value.zoom) && isFiniteNumber(value.bearing) && isFiniteNumber(value.pitch);
}

export function clampZoom(zoom: number, minZoom = 0, maxZoom = 24): number {
	if (!Number.isFinite(zoom)) return minZoom;
	return Math.min(Math.max(zoom, minZoom), maxZoom);
}

export function cameraFromBounds(bounds: BoundingBox, zoom = SINGLE_FEATURE_ZOOM): MapCamera {
	return {
		center: {
			lng: (bounds.west + bounds.east) / 2,
			lat: (bounds.south + bounds.north) / 2,
		},
		zoom,
		bearing: 0,
		pitch: 0,
	};
}

function isLngLatRecord(value: unknown): value is LngLat {
	if (!isRecord(value)) return false;
	return isFiniteNumber(value.lng) && isFiniteNumber(value.lat);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
