import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
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
 * Server-side filters for the outreach vector tiles. Mirrors the query params
 * the `/map/tiles/outreach/{z}/{x}/{y}.mvt` endpoint understands; the same shape
 * drives the `/map/outreach` paged list so the map and the list stay in lockstep.
 */
export interface OutreachTileFilters extends RegionScopedTileFilters {
	readonly outreachMethodIds?: readonly string[];
	/** Match outreach performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on outreach date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on outreach date. */
	readonly dateTo?: string;
}

export const OUTREACH_SOURCE_ID = 'outreach';
const OUTREACH_SOURCE_LAYER = 'outreach';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.outreach,
	line: mapDomain.outreachLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select an action. Order = hit priority. */
export const OUTREACH_INTERACTIVE_LAYER_IDS = [
	`${OUTREACH_SOURCE_ID}-points`,
	`${OUTREACH_SOURCE_ID}-lines`,
	`${OUTREACH_SOURCE_ID}-polygon-fill`,
] as const;

const OUTREACH_SELECTED_LAYER_IDS = [
	`${OUTREACH_SOURCE_ID}-selected-fill`,
	`${OUTREACH_SOURCE_ID}-selected-outline`,
	`${OUTREACH_SOURCE_ID}-selected-line`,
	`${OUTREACH_SOURCE_ID}-selected-point`,
] as const;

export const OUTREACH_LAYER_IDS = [
	`${OUTREACH_SOURCE_ID}-polygon-fill`,
	`${OUTREACH_SOURCE_ID}-polygon-outline`,
	`${OUTREACH_SOURCE_ID}-lines`,
	`${OUTREACH_SOURCE_ID}-points`,
	...OUTREACH_SELECTED_LAYER_IDS,
] as const;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildOutreachTileUrl(serverUrl: string, filters?: OutreachTileFilters): string {
	return tileTemplateUrl(serverUrl, OUTREACH_SOURCE_ID, outreachTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildOutreachExtentUrl(serverUrl: string, filters?: OutreachTileFilters): string {
	return tileExtentUrl(serverUrl, OUTREACH_SOURCE_ID, outreachTileParams(filters));
}

function outreachTileParams(filters?: OutreachTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.outreachMethodIds !== undefined && filters.outreachMethodIds.length > 0) {
		params.set('outreachMethodId', [...filters.outreachMethodIds].sort().join(','));
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

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the outreach source. `selectedId` drives the highlight set. */
export function outreachTileLayers(
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
			id: `${OUTREACH_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': colors.base, 'fill-opacity': 0.24 },
		},
		{
			id: `${OUTREACH_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': colors.base,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${OUTREACH_SOURCE_ID}-lines`,
			type: 'line',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': colors.line,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${OUTREACH_SOURCE_ID}-points`,
			type: 'circle',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
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
			id: `${OUTREACH_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${OUTREACH_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${OUTREACH_SOURCE_ID}-selected-line`,
			type: 'line',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${OUTREACH_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: OUTREACH_SOURCE_ID,
			'source-layer': OUTREACH_SOURCE_LAYER,
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

export { OUTREACH_SELECTED_LAYER_IDS };
