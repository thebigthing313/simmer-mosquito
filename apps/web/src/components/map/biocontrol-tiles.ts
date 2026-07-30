import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';
import { tileExtentUrl, tileTemplateUrl } from './tile-urls';

/**
 * Server-side filters for the biocontrol vector tiles. Mirrors the query params
 * the `/map/tiles/biocontrol/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/biocontrol` paged list so the map and the list stay in
 * lockstep.
 */
export interface BiocontrolTileFilters {
	readonly biocontrolMethodIds?: readonly string[];
	/** Only activities tied to a habitat record. */
	readonly habitatLinkedOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on activity date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on activity date. */
	readonly dateTo?: string;
}

export const BIOCONTROL_SOURCE_ID = 'biocontrol';
const BIOCONTROL_SOURCE_LAYER = 'biocontrol';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.biocontrol,
	line: mapDomain.biocontrolLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select an activity. Order = hit priority. */
export const BIOCONTROL_INTERACTIVE_LAYER_IDS = [
	`${BIOCONTROL_SOURCE_ID}-points`,
	`${BIOCONTROL_SOURCE_ID}-lines`,
	`${BIOCONTROL_SOURCE_ID}-polygon-fill`,
] as const;

const BIOCONTROL_SELECTED_LAYER_IDS = [
	`${BIOCONTROL_SOURCE_ID}-selected-fill`,
	`${BIOCONTROL_SOURCE_ID}-selected-outline`,
	`${BIOCONTROL_SOURCE_ID}-selected-line`,
	`${BIOCONTROL_SOURCE_ID}-selected-point`,
] as const;

export const BIOCONTROL_LAYER_IDS = [
	`${BIOCONTROL_SOURCE_ID}-polygon-fill`,
	`${BIOCONTROL_SOURCE_ID}-polygon-outline`,
	`${BIOCONTROL_SOURCE_ID}-lines`,
	`${BIOCONTROL_SOURCE_ID}-points`,
	...BIOCONTROL_SELECTED_LAYER_IDS,
] as const;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildBiocontrolTileUrl(serverUrl: string, filters?: BiocontrolTileFilters): string {
	return tileTemplateUrl(serverUrl, BIOCONTROL_SOURCE_ID, biocontrolTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildBiocontrolExtentUrl(
	serverUrl: string,
	filters?: BiocontrolTileFilters,
): string {
	return tileExtentUrl(serverUrl, BIOCONTROL_SOURCE_ID, biocontrolTileParams(filters));
}

function biocontrolTileParams(filters?: BiocontrolTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.biocontrolMethodIds !== undefined && filters.biocontrolMethodIds.length > 0) {
		params.set('biocontrolMethodId', [...filters.biocontrolMethodIds].sort().join(','));
	}
	if (filters?.habitatLinkedOnly === true) {
		params.set('habitatLinked', 'true');
	}
	if (filters?.dateFrom !== undefined) {
		params.set('dateFrom', filters.dateFrom);
	}
	if (filters?.dateTo !== undefined) {
		params.set('dateTo', filters.dateTo);
	}

	return params;
}

/** The GL layers for the biocontrol source. `selectedId` drives the highlight set. */
export function biocontrolTileLayers(
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
			id: `${BIOCONTROL_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': colors.base, 'fill-opacity': 0.24 },
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': colors.base,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-lines`,
			type: 'line',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': colors.line,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-points`,
			type: 'circle',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
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
			id: `${BIOCONTROL_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-selected-line`,
			type: 'line',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${BIOCONTROL_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: BIOCONTROL_SOURCE_ID,
			'source-layer': BIOCONTROL_SOURCE_LAYER,
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

export { BIOCONTROL_SELECTED_LAYER_IDS };
