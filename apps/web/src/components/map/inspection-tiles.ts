import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';

/**
 * Server-side filters for the inspection vector tiles. Mirrors the query params
 * the `/map/tiles/inspections/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/inspections` bbox list so the map and the list stay in
 * lockstep.
 */
export interface InspectionTileFilters {
	readonly isWet?: boolean;
	/** Larval-density enum values (`none` … `very_heavy`). */
	readonly densities?: readonly string[];
	/** Only inspections where at least one life stage was found. */
	readonly positiveOnly?: boolean;
	readonly habitatTypeIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on inspection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on inspection date. */
	readonly dateTo?: string;
}

export const INSPECTION_SOURCE_ID = 'inspections';
const INSPECTION_SOURCE_LAYER = 'inspections';

/**
 * Density heat ramp. Points are colored by the surveillance signal — a dry site
 * reads as neutral, a clean wet site as calm blue, and larval density climbs
 * amber → orange → red so the map itself surfaces where the pressure is. Kept as
 * literals: GL paint can't read CSS custom props. The list badges carry the same
 * meaning in words, so color is never the only channel.
 */
const colors = {
	dry: '#8b9a9c',
	none: '#3f93bf',
	light: '#e0b13a',
	medium: '#ea8a3c',
	heavy: '#e0533a',
	veryHeavy: '#b01f2e',
	pointStroke: '#f9fdfb',
	line: '#2d46b6',
	selected: '#16b364',
} as const;

/**
 * The density heat colors, keyed by the `larval_density` enum, plus the dry tone.
 * Exported so the explorer's density-filter chips and the map ramp read from a
 * single source of truth — the filter chips double as the map's legend.
 */
export const INSPECTION_DENSITY_COLORS: Readonly<Record<string, string>> = {
	none: colors.none,
	light: colors.light,
	medium: colors.medium,
	heavy: colors.heavy,
	very_heavy: colors.veryHeavy,
};

export const INSPECTION_DRY_COLOR = colors.dry;

/** Layers the user can click to select an inspection. Order = hit priority. */
export const INSPECTION_INTERACTIVE_LAYER_IDS = [
	`${INSPECTION_SOURCE_ID}-points`,
	`${INSPECTION_SOURCE_ID}-lines`,
	`${INSPECTION_SOURCE_ID}-polygon-fill`,
] as const;

const INSPECTION_SELECTED_LAYER_IDS = [
	`${INSPECTION_SOURCE_ID}-selected-fill`,
	`${INSPECTION_SOURCE_ID}-selected-outline`,
	`${INSPECTION_SOURCE_ID}-selected-line`,
	`${INSPECTION_SOURCE_ID}-selected-point`,
] as const;

export const INSPECTION_LAYER_IDS = [
	`${INSPECTION_SOURCE_ID}-polygon-fill`,
	`${INSPECTION_SOURCE_ID}-polygon-outline`,
	`${INSPECTION_SOURCE_ID}-lines`,
	`${INSPECTION_SOURCE_ID}-points`,
	...INSPECTION_SELECTED_LAYER_IDS,
] as const;

// Wet sites match on density; a null/unrecorded density falls to the "none"
// tone. A dry site is neutral regardless of density.
const densityColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isWet'], false],
	[
		'match',
		['get', 'density'],
		'very_heavy',
		colors.veryHeavy,
		'heavy',
		colors.heavy,
		'medium',
		colors.medium,
		'light',
		colors.light,
		'none',
		colors.none,
		colors.none,
	],
	colors.dry,
];

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildInspectionTileUrl(serverUrl: string, filters?: InspectionTileFilters): string {
	const base = `${serverUrl.replace(/\/+$/, '')}/map/tiles/${INSPECTION_SOURCE_ID}/{z}/{x}/{y}.mvt`;
	const params = new URLSearchParams();

	if (filters?.isWet !== undefined) {
		params.set('isWet', String(filters.isWet));
	}
	if (filters?.densities !== undefined && filters.densities.length > 0) {
		params.set('density', [...filters.densities].sort().join(','));
	}
	if (filters?.positiveOnly === true) {
		params.set('positive', 'true');
	}
	if (filters?.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		params.set('habitatTypeId', [...filters.habitatTypeIds].sort().join(','));
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

/** The GL layers for the inspection source. `selectedId` drives the highlight set. */
export function inspectionTileLayers(
	selectedId: string | null,
): (FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification)[] {
	// Match the `id` property, not the feature id: tiles use the 4-arg ST_AsMVT (no
	// native feature id) and promoteId doesn't reach render-time filters, so `['id']`
	// evaluates to undefined here. An id no feature can carry keeps this empty when
	// nothing is selected.
	const matchesSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId ?? ' '];
	const selectedPolygon: ExpressionSpecification = ['all', polygonOnly, matchesSelected];
	const selectedLine: ExpressionSpecification = ['all', lineOnly, matchesSelected];
	const selectedPoint: ExpressionSpecification = ['all', pointOnly, matchesSelected];

	return [
		{
			id: `${INSPECTION_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': densityColor, 'fill-opacity': 0.24 },
		},
		{
			id: `${INSPECTION_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': densityColor,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${INSPECTION_SOURCE_ID}-lines`,
			type: 'line',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': densityColor,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${INSPECTION_SOURCE_ID}-points`,
			type: 'circle',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: pointOnly,
			paint: {
				'circle-color': densityColor,
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${INSPECTION_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${INSPECTION_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${INSPECTION_SOURCE_ID}-selected-line`,
			type: 'line',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${INSPECTION_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: INSPECTION_SOURCE_ID,
			'source-layer': INSPECTION_SOURCE_LAYER,
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

export { INSPECTION_SELECTED_LAYER_IDS };
