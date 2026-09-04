/**
 * Baseline basemap catalogue and camera defaults for every map surface.
 *
 * Framework-free on purpose: this module only knows about Mapbox style URLs and
 * the public access token, so it can be shared by the map hook, the basemap
 * switcher, and any future map surface without dragging React along.
 */

export type MapCamera = {
	readonly center: [number, number];
	readonly zoom: number;
	readonly bearing?: number;
	readonly pitch?: number;
};

/** Continental-US framing until an agency's own extent is known. */
export const DEFAULT_MAP_CAMERA: MapCamera = {
	center: [-95.7, 37.1],
	zoom: 3.4,
	bearing: 0,
	pitch: 0,
};

/**
 * How far in any SIMMER map will go.
 *
 * Mapbox's own ceiling is 22, which is several steps past where either basemap
 * has imagery: the last few zooms upscale one tile and the reader is looking at
 * a blur that still says it is a map. 19 is roughly a rooftop, which is as fine
 * as a Habitat or a trap site is ever placed.
 */
export const MAX_MAP_ZOOM = 19;

export type BasemapId = 'streets' | 'satellite';

export interface BasemapStyle {
	readonly id: BasemapId;
	readonly label: string;
	readonly styleUrl: string;
}

const STREETS: BasemapStyle = {
	id: 'streets',
	label: 'Streets',
	styleUrl: 'mapbox://styles/thebigthing313/cmsjd3mrr011f01s6dc775u0z',
};

const SATELLITE: BasemapStyle = {
	id: 'satellite',
	label: 'Satellite',
	styleUrl: 'mapbox://styles/thebigthing313/cmsjd8raa00kf01s93gzw8ggf',
};

/** The basemaps we expose today. Order is the display order in the switcher. */
export const BASEMAP_STYLES: readonly BasemapStyle[] = [STREETS, SATELLITE];

export const DEFAULT_BASEMAP_ID: BasemapId = 'streets';

/** Resolve a basemap by id, falling back to Streets so callers never get undefined. */
export function basemapStyle(id: BasemapId): BasemapStyle {
	return BASEMAP_STYLES.find((style) => style.id === id) ?? STREETS;
}

/**
 * The public Mapbox token from the Vite environment. Returns an empty string
 * when unset so the map surface can render a teaching fallback instead of a
 * broken canvas.
 */
export function getMapboxToken(): string {
	return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '';
}
