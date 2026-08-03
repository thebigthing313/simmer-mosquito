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
 * Server-side filters for the chemical-application vector tiles. Mirrors the
 * query params the `/map/tiles/chemical/{z}/{x}/{y}.mvt` endpoint understands;
 * the same shape drives the `/map/chemical` paged list so the map and the list
 * stay in lockstep.
 */
export interface ChemicalTileFilters extends RegionScopedTileFilters {
	readonly insecticideIds?: readonly string[];
	readonly applicationMethodIds?: readonly string[];
	/** Match applications performed by any of these profiles. */
	readonly applicatorProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on application date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on application date. */
	readonly dateTo?: string;
}

export const CHEMICAL_SOURCE_ID = 'chemical';
const CHEMICAL_SOURCE_LAYER = 'chemical';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.chemical,
	line: mapDomain.chemicalLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select an application. Order = hit priority. */
export const CHEMICAL_INTERACTIVE_LAYER_IDS = [
	`${CHEMICAL_SOURCE_ID}-points`,
	`${CHEMICAL_SOURCE_ID}-lines`,
	`${CHEMICAL_SOURCE_ID}-polygon-fill`,
] as const;

const CHEMICAL_SELECTED_LAYER_IDS = [
	`${CHEMICAL_SOURCE_ID}-selected-fill`,
	`${CHEMICAL_SOURCE_ID}-selected-outline`,
	`${CHEMICAL_SOURCE_ID}-selected-line`,
	`${CHEMICAL_SOURCE_ID}-selected-point`,
] as const;

export const CHEMICAL_LAYER_IDS = [
	`${CHEMICAL_SOURCE_ID}-polygon-fill`,
	`${CHEMICAL_SOURCE_ID}-polygon-outline`,
	`${CHEMICAL_SOURCE_ID}-lines`,
	`${CHEMICAL_SOURCE_ID}-points`,
	...CHEMICAL_SELECTED_LAYER_IDS,
] as const;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildChemicalTileUrl(serverUrl: string, filters?: ChemicalTileFilters): string {
	return tileTemplateUrl(serverUrl, CHEMICAL_SOURCE_ID, chemicalTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildChemicalExtentUrl(serverUrl: string, filters?: ChemicalTileFilters): string {
	return tileExtentUrl(serverUrl, CHEMICAL_SOURCE_ID, chemicalTileParams(filters));
}

function chemicalTileParams(filters?: ChemicalTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.insecticideIds !== undefined && filters.insecticideIds.length > 0) {
		params.set('insecticideId', [...filters.insecticideIds].sort().join(','));
	}
	if (filters?.applicationMethodIds !== undefined && filters.applicationMethodIds.length > 0) {
		params.set('applicationMethodId', [...filters.applicationMethodIds].sort().join(','));
	}
	if (filters?.applicatorProfileIds !== undefined && filters.applicatorProfileIds.length > 0) {
		params.set('applicator', [...filters.applicatorProfileIds].sort().join(','));
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

/** The GL layers for the chemical source. `selectedId` drives the highlight set. */
export function chemicalTileLayers(
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
			id: `${CHEMICAL_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': colors.base, 'fill-opacity': 0.24 },
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': colors.base,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-lines`,
			type: 'line',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': colors.line,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-points`,
			type: 'circle',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
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
			id: `${CHEMICAL_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-selected-line`,
			type: 'line',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${CHEMICAL_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: CHEMICAL_SOURCE_ID,
			'source-layer': CHEMICAL_SOURCE_LAYER,
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

export { CHEMICAL_SELECTED_LAYER_IDS };
