import type {
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';

/**
 * Server-side filters for the region vector tiles. Mirrors the query params the
 * `/map/tiles/regions/{z}/{x}/{y}.mvt` endpoint understands.
 */
export interface RegionTileFilters {
	/** A folder id, or the literal `'unfiled'` for folderless regions. */
	readonly regionFolderId?: string;
	readonly search?: string;
}

export const REGION_SOURCE_ID = 'regions';
const REGION_SOURCE_LAYER = 'regions';

/** Map paint colors. Kept as literals — GL paint can't read CSS custom props. */
const colors = {
	fill: '#2d46b6',
	outline: '#2d46b6',
	selected: '#f59e0b',
	selectedOutline: '#b45309',
} as const;

/** Layers the user can click to select a region. */
export const REGION_INTERACTIVE_LAYER_IDS = [`${REGION_SOURCE_ID}-fill`] as const;

const REGION_SELECTED_LAYER_IDS = [
	`${REGION_SOURCE_ID}-selected-fill`,
	`${REGION_SOURCE_ID}-selected-outline`,
] as const;

export const REGION_LAYER_IDS = [
	`${REGION_SOURCE_ID}-fill`,
	`${REGION_SOURCE_ID}-outline`,
	...REGION_SELECTED_LAYER_IDS,
] as const;

/** Build the tile template URL with the active filters folded into the query. */
export function buildRegionTileUrl(serverUrl: string, filters?: RegionTileFilters): string {
	const base = `${serverUrl.replace(/\/+$/, '')}/map/tiles/${REGION_SOURCE_ID}/{z}/{x}/{y}.mvt`;
	const params = new URLSearchParams();

	if (filters?.regionFolderId !== undefined && filters.regionFolderId.length > 0) {
		params.set('regionFolderId', filters.regionFolderId);
	}
	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		params.set('search', search);
	}

	const query = params.toString();
	return query.length === 0 ? base : `${base}?${query}`;
}

/** The GL layers for the region source. `selectedId` drives the highlight set. */
export function regionTileLayers(
	selectedId: string | null,
): (FillLayerSpecification | LineLayerSpecification)[] {
	// An id no feature can carry keeps the highlight layers empty when nothing is selected.
	const matchesSelected: ExpressionSpecification = ['==', ['id'], selectedId ?? ' '];

	return [
		{
			id: `${REGION_SOURCE_ID}-fill`,
			type: 'fill',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			paint: { 'fill-color': colors.fill, 'fill-opacity': 0.16 },
		},
		{
			id: `${REGION_SOURCE_ID}-outline`,
			type: 'line',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			paint: {
				'line-color': colors.outline,
				'line-opacity': 0.72,
				'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 16, 2],
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${REGION_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: matchesSelected,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.32 },
		},
		{
			id: `${REGION_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: matchesSelected,
			paint: { 'line-color': colors.selectedOutline, 'line-width': 3 },
		},
	];
}

export { REGION_SELECTED_LAYER_IDS };
