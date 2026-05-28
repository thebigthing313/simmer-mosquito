import type { GeoJsonFeatureCollection } from './geometry.js';
import type { MapTileSourceDefinition } from './tiles.js';

export type MapOverlayGroup = 'catalog' | 'operations' | 'boundaries' | 'context' | (string & {});

export interface MapOverlayDefinition {
	readonly id: string;
	readonly label: string;
	readonly group?: MapOverlayGroup;
	readonly defaultVisible: boolean;
	readonly source:
		| { readonly kind: 'mvt'; readonly tileSource: MapTileSourceDefinition }
		| { readonly kind: 'geojson'; readonly data: GeoJsonFeatureCollection };
}

export type MapOverlayVisibility = Readonly<Record<string, boolean>>;

export function overlayVisibilityFromDefinitions(
	overlays: readonly MapOverlayDefinition[],
): MapOverlayVisibility {
	const visibility: Record<string, boolean> = {};
	for (const overlay of overlays) visibility[overlay.id] = overlay.defaultVisible;
	return visibility;
}

export function normalizeOverlayVisibility(
	overlays: readonly MapOverlayDefinition[],
	visibility: MapOverlayVisibility,
): MapOverlayVisibility {
	const normalized = { ...overlayVisibilityFromDefinitions(overlays) };
	for (const overlay of overlays) {
		const nextVisible = visibility[overlay.id];
		if (nextVisible !== undefined) normalized[overlay.id] = nextVisible;
	}
	return normalized;
}

export function getVisibleOverlayIds(
	overlays: readonly MapOverlayDefinition[],
	visibility: MapOverlayVisibility,
): readonly string[] {
	const normalized = normalizeOverlayVisibility(overlays, visibility);
	return overlays.filter((overlay) => normalized[overlay.id] === true).map((overlay) => overlay.id);
}
