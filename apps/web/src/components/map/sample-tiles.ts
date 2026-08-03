import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';
import {
	type RegionScopedTileFilters,
	setRegionTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the sample vector tiles. Mirrors the query params the
 * `/map/tiles/samples/{z}/{x}/{y}.mvt` endpoint understands; the same shape drives
 * the `/map/samples` bbox list so the map and the list stay in lockstep.
 */
export interface SampleTileFilters extends RegionScopedTileFilters {
	/** Species ids the sample must have an identified result for. */
	readonly speciesIds?: readonly string[];
	/** Lifecycle status (`identified` … `unidentifiable`). */
	readonly status?: string;
	/** Only samples flagged with non-mosquito material. */
	readonly nonMosquitoOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on the parent inspection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on the parent inspection date. */
	readonly dateTo?: string;
}

export const SAMPLE_SOURCE_ID = 'samples';
const SAMPLE_SOURCE_LAYER = 'samples';

/**
 * Status palette. Points are colored by where a sample sits in the lab workflow —
 * amber for the awaiting queue that needs attention, teal once identified, slate
 * when it held no larvae, and red when it couldn't be identified. Kept as literals
 * (GL paint can't read CSS custom props); the list badges carry the same meaning
 * in words, so color is never the only channel.
 */
const colors = {
	identified: mapStatus.resolved,
	awaiting: mapStatus.pending,
	zeroLarvae: mapStatus.neutral,
	unidentifiable: mapStatus.problem,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/**
 * The status colors, keyed by the resolved sample status, exported so the
 * explorer's status-filter chips and the map ramp read from a single source of
 * truth — the filter chips double as the map's legend.
 */
export const SAMPLE_STATUS_COLORS: Readonly<Record<string, string>> = {
	identified: colors.identified,
	awaiting: colors.awaiting,
	zero_larvae: colors.zeroLarvae,
	unidentifiable: colors.unidentifiable,
};

/** Layers the user can click to select a sample. Order = hit priority. */
export const SAMPLE_INTERACTIVE_LAYER_IDS = [
	`${SAMPLE_SOURCE_ID}-points`,
	`${SAMPLE_SOURCE_ID}-lines`,
	`${SAMPLE_SOURCE_ID}-polygon-fill`,
] as const;

const SAMPLE_SELECTED_LAYER_IDS = [
	`${SAMPLE_SOURCE_ID}-selected-fill`,
	`${SAMPLE_SOURCE_ID}-selected-outline`,
	`${SAMPLE_SOURCE_ID}-selected-line`,
	`${SAMPLE_SOURCE_ID}-selected-point`,
] as const;

export const SAMPLE_LAYER_IDS = [
	`${SAMPLE_SOURCE_ID}-polygon-fill`,
	`${SAMPLE_SOURCE_ID}-polygon-outline`,
	`${SAMPLE_SOURCE_ID}-lines`,
	`${SAMPLE_SOURCE_ID}-points`,
	...SAMPLE_SELECTED_LAYER_IDS,
] as const;

// Color by the server-resolved status property; an unexpected value falls to the
// awaiting tone so a point is never left unpainted.
const statusColor: ExpressionSpecification = [
	'match',
	['get', 'status'],
	'identified',
	colors.identified,
	'awaiting',
	colors.awaiting,
	'zero_larvae',
	colors.zeroLarvae,
	'unidentifiable',
	colors.unidentifiable,
	colors.awaiting,
];

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildSampleTileUrl(serverUrl: string, filters?: SampleTileFilters): string {
	return tileTemplateUrl(serverUrl, SAMPLE_SOURCE_ID, sampleTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSampleExtentUrl(serverUrl: string, filters?: SampleTileFilters): string {
	return tileExtentUrl(serverUrl, SAMPLE_SOURCE_ID, sampleTileParams(filters));
}

function sampleTileParams(filters?: SampleTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.speciesIds !== undefined && filters.speciesIds.length > 0) {
		params.set('species', [...filters.speciesIds].sort().join(','));
	}
	if (filters?.status !== undefined && filters.status.length > 0) {
		params.set('status', filters.status);
	}
	if (filters?.nonMosquitoOnly === true) {
		params.set('nonMosquito', 'true');
	}
	if (filters?.dateFrom !== undefined) {
		params.set('dateFrom', filters.dateFrom);
	}
	if (filters?.dateTo !== undefined) {
		params.set('dateTo', filters.dateTo);
	}

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the sample source. `selectedId` drives the highlight set. */
export function sampleTileLayers(
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
			id: `${SAMPLE_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': statusColor, 'fill-opacity': 0.24 },
		},
		{
			id: `${SAMPLE_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': statusColor,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${SAMPLE_SOURCE_ID}-lines`,
			type: 'line',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': statusColor,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${SAMPLE_SOURCE_ID}-points`,
			type: 'circle',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: pointOnly,
			paint: {
				'circle-color': statusColor,
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${SAMPLE_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${SAMPLE_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${SAMPLE_SOURCE_ID}-selected-line`,
			type: 'line',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${SAMPLE_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: SAMPLE_SOURCE_ID,
			'source-layer': SAMPLE_SOURCE_LAYER,
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

export { SAMPLE_SELECTED_LAYER_IDS };
