import { mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
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
 * Server-side filters for the trap vector tiles. Mirrors the query params the
 * `/map/tiles/traps/{z}/{x}/{y}.mvt` endpoint understands; the same shape drives
 * the `/map/traps` paged list so the map and the list stay in lockstep.
 */
export interface TrapTileFilters extends RegionScopedTileFilters {
	readonly collectionMethodIds?: readonly string[];
	readonly isActive?: boolean;
	readonly search?: string;
}

export const TRAP_SOURCE_ID = 'traps';
const TRAP_SOURCE_LAYER = 'traps';

/**
 * Map paint colors. Traps carry an `isActive` feature property, so points read
 * their status straight off the map — active green, inactive gray. Kept as
 * literals: GL paint can't read CSS custom props.
 */
const colors = {
	active: mapLifecycle.active,
	inactive: mapLifecycle.inactive,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a trap. Order = hit priority. */
export const TRAP_INTERACTIVE_LAYER_IDS = [
	`${TRAP_SOURCE_ID}-points`,
	`${TRAP_SOURCE_ID}-lines`,
	`${TRAP_SOURCE_ID}-polygon-fill`,
] as const;

const TRAP_SELECTED_LAYER_IDS = [
	`${TRAP_SOURCE_ID}-selected-fill`,
	`${TRAP_SOURCE_ID}-selected-outline`,
	`${TRAP_SOURCE_ID}-selected-line`,
	`${TRAP_SOURCE_ID}-selected-point`,
] as const;

export const TRAP_LAYER_IDS = [
	`${TRAP_SOURCE_ID}-polygon-fill`,
	`${TRAP_SOURCE_ID}-polygon-outline`,
	`${TRAP_SOURCE_ID}-lines`,
	`${TRAP_SOURCE_ID}-points`,
	...TRAP_SELECTED_LAYER_IDS,
] as const;

// A trap with no recorded `isActive` reads as active — the common case.
const statusColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isActive'], true],
	colors.active,
	colors.inactive,
];

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Build the tile template URL with the active filters folded into the query. */
export function buildTrapTileUrl(serverUrl: string, filters?: TrapTileFilters): string {
	return tileTemplateUrl(serverUrl, TRAP_SOURCE_ID, trapTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildTrapExtentUrl(serverUrl: string, filters?: TrapTileFilters): string {
	return tileExtentUrl(serverUrl, TRAP_SOURCE_ID, trapTileParams(filters));
}

function trapTileParams(filters?: TrapTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		params.set('collectionMethodId', [...filters.collectionMethodIds].sort().join(','));
	}
	if (filters?.isActive === true) {
		params.set('status', 'active');
	} else if (filters?.isActive === false) {
		params.set('status', 'inactive');
	}
	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		params.set('search', search);
	}

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the trap source. `selectedId` drives the highlight set. */
export function trapTileLayers(
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
			id: `${TRAP_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: polygonOnly,
			paint: { 'fill-color': statusColor, 'fill-opacity': 0.24 },
		},
		{
			id: `${TRAP_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: polygonOnly,
			paint: {
				'line-color': statusColor,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${TRAP_SOURCE_ID}-lines`,
			type: 'line',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: lineOnly,
			paint: {
				'line-color': statusColor,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${TRAP_SOURCE_ID}-points`,
			type: 'circle',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
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
			id: `${TRAP_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${TRAP_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: selectedPolygon,
			paint: { 'line-color': colors.selected, 'line-width': 3 },
		},
		{
			id: `${TRAP_SOURCE_ID}-selected-line`,
			type: 'line',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
			filter: selectedLine,
			paint: { 'line-color': colors.selected, 'line-width': 5 },
		},
		{
			id: `${TRAP_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: TRAP_SOURCE_ID,
			'source-layer': TRAP_SOURCE_LAYER,
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

export { TRAP_SELECTED_LAYER_IDS };
