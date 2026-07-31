import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';
import { tileExtentUrl, tileTemplateUrl } from './tile-urls';

/**
 * Server-side filters for the source-reduction vector tiles. Mirrors the
 * query params the `/map/tiles/source-reduction/{z}/{x}/{y}.mvt` endpoint
 * understands; the same shape drives the `/map/source-reduction` paged list so
 * the map and the list stay in lockstep.
 */
export interface SourceReductionTileFilters {
	readonly sourceReductionMethodIds?: readonly string[];
	/** Match source reduction performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on activity date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on activity date. */
	readonly dateTo?: string;
}

export const SOURCE_REDUCTION_SOURCE_ID = 'source-reduction';
const SOURCE_REDUCTION_SOURCE_LAYER = 'source-reduction';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.sourceReduction,
	line: mapDomain.sourceReductionLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select an activity. Order = hit priority. */
export const SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS = [
	`${SOURCE_REDUCTION_SOURCE_ID}-points`,
	`${SOURCE_REDUCTION_SOURCE_ID}-lines`,
	`${SOURCE_REDUCTION_SOURCE_ID}-polygon-fill`,
] as const;

const SOURCE_REDUCTION_SELECTED_LAYER_IDS = [
	`${SOURCE_REDUCTION_SOURCE_ID}-selected-fill`,
	`${SOURCE_REDUCTION_SOURCE_ID}-selected-outline`,
	`${SOURCE_REDUCTION_SOURCE_ID}-selected-line`,
	`${SOURCE_REDUCTION_SOURCE_ID}-selected-point`,
] as const;

export const SOURCE_REDUCTION_LAYER_IDS = [
	`${SOURCE_REDUCTION_SOURCE_ID}-polygon-fill`,
	`${SOURCE_REDUCTION_SOURCE_ID}-polygon-outline`,
	`${SOURCE_REDUCTION_SOURCE_ID}-lines`,
	`${SOURCE_REDUCTION_SOURCE_ID}-points`,
	...SOURCE_REDUCTION_SELECTED_LAYER_IDS,
] as const;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildSourceReductionTileUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
): string {
	return tileTemplateUrl(serverUrl, SOURCE_REDUCTION_SOURCE_ID, sourceReductionTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSourceReductionExtentUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
): string {
	return tileExtentUrl(serverUrl, SOURCE_REDUCTION_SOURCE_ID, sourceReductionTileParams(filters));
}

function sourceReductionTileParams(filters?: SourceReductionTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (
		filters?.sourceReductionMethodIds !== undefined &&
		filters.sourceReductionMethodIds.length > 0
	) {
		params.set('sourceReductionMethodId', [...filters.sourceReductionMethodIds].sort().join(','));
	}
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		params.set('technician', [...filters.technicianProfileIds].sort().join(','));
	}
	if (filters?.dateFrom !== undefined) {
		params.set('dateFrom', filters.dateFrom);
	}
	if (filters?.dateTo !== undefined) {
		params.set('dateTo', filters.dateTo);
	}

	return params;
}

/** The GL layers for the source-reduction source. `selectedId` drives the highlight set. */
export function sourceReductionTileLayers(
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
			id: `${SOURCE_REDUCTION_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': colors.base, 'fill-opacity': 0.24 },
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': colors.base,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-lines`,
			type: 'line',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': colors.line,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-points`,
			type: 'circle',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: pointOnly,
			paint: {
				'circle-color': colors.base,
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-selected-line`,
			type: 'line',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${SOURCE_REDUCTION_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: SOURCE_REDUCTION_SOURCE_ID,
			'source-layer': SOURCE_REDUCTION_SOURCE_LAYER,
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

export { SOURCE_REDUCTION_SELECTED_LAYER_IDS };
