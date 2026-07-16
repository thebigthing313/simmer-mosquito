import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';

/**
 * Server-side filters for the collection vector tiles. Mirrors the query params
 * the `/map/tiles/collections/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/collections` paged list so the map and the list stay in
 * lockstep.
 */
export interface CollectionTileFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Only collections flagged with a problem. */
	readonly problemOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on collection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on collection date. */
	readonly dateTo?: string;
}

export const COLLECTION_SOURCE_ID = 'collections';
const COLLECTION_SOURCE_LAYER = 'collections';

/**
 * Map paint colors. Collections carry a `hasProblem` feature property, so points
 * read their status straight off the map — a flagged collection burns amber-red,
 * a clean one stays calm teal. Kept as literals: GL paint can't read CSS custom
 * props.
 */
const colors = {
	base: '#2f9e8f',
	problem: '#d6503f',
	pointStroke: '#f9fdfb',
	selected: '#16b364',
} as const;

/** Layers the user can click to select a collection. Order = hit priority. */
export const COLLECTION_INTERACTIVE_LAYER_IDS = [
	`${COLLECTION_SOURCE_ID}-points`,
	`${COLLECTION_SOURCE_ID}-lines`,
	`${COLLECTION_SOURCE_ID}-polygon-fill`,
] as const;

const COLLECTION_SELECTED_LAYER_IDS = [
	`${COLLECTION_SOURCE_ID}-selected-fill`,
	`${COLLECTION_SOURCE_ID}-selected-outline`,
	`${COLLECTION_SOURCE_ID}-selected-line`,
	`${COLLECTION_SOURCE_ID}-selected-point`,
] as const;

export const COLLECTION_LAYER_IDS = [
	`${COLLECTION_SOURCE_ID}-polygon-fill`,
	`${COLLECTION_SOURCE_ID}-polygon-outline`,
	`${COLLECTION_SOURCE_ID}-lines`,
	`${COLLECTION_SOURCE_ID}-points`,
	...COLLECTION_SELECTED_LAYER_IDS,
] as const;

// A collection with no recorded `hasProblem` reads as clean — the common case.
const problemColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'hasProblem'], false],
	colors.problem,
	colors.base,
];

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildCollectionTileUrl(serverUrl: string, filters?: CollectionTileFilters): string {
	const base = `${serverUrl.replace(/\/+$/, '')}/map/tiles/${COLLECTION_SOURCE_ID}/{z}/{x}/{y}.mvt`;
	const params = new URLSearchParams();

	if (filters?.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		params.set('collectionMethodId', [...filters.collectionMethodIds].sort().join(','));
	}
	if (filters?.problemOnly === true) {
		params.set('problem', 'true');
	}
	if (filters?.dateFrom !== undefined) {
		params.set('dateFrom', filters.dateFrom);
	}
	if (filters?.dateTo !== undefined) {
		params.set('dateTo', filters.dateTo);
	}

	const query = params.toString();
	return query.length === 0 ? base : `${base}?${query}`;
}

/** The GL layers for the collection source. `selectedId` drives the highlight set. */
export function collectionTileLayers(
	selectedId: string | null,
): (FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification)[] {
	// An id no feature can carry keeps the highlight layers empty when nothing is selected.
	const matchesSelected: ExpressionSpecification = ['==', ['id'], selectedId ?? ' '];
	const selectedPolygon: ExpressionSpecification = ['all', polygonOnly, matchesSelected];
	const selectedLine: ExpressionSpecification = ['all', lineOnly, matchesSelected];
	const selectedPoint: ExpressionSpecification = ['all', pointOnly, matchesSelected];

	return [
		{
			id: `${COLLECTION_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': problemColor, 'fill-opacity': 0.24 },
		},
		{
			id: `${COLLECTION_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': problemColor,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${COLLECTION_SOURCE_ID}-lines`,
			type: 'line',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': problemColor,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${COLLECTION_SOURCE_ID}-points`,
			type: 'circle',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: pointOnly,
			paint: {
				'circle-color': problemColor,
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${COLLECTION_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${COLLECTION_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${COLLECTION_SOURCE_ID}-selected-line`,
			type: 'line',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${COLLECTION_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: COLLECTION_SOURCE_ID,
			'source-layer': COLLECTION_SOURCE_LAYER,
			filter: selectedPoint,
			paint: {
				'circle-color': colors.selected,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 16, 10],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 2.5,
			},
		},
	];
}

export { COLLECTION_SELECTED_LAYER_IDS };
