import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, REGION_MAP_FILTERS } from '@simmer-mosquito/domain';
import type {
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';
import { tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `regions` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. `ids`
 * narrows the extent alone: the tiles stream every region and hide the rest
 * through {@link regionVisibilityFilter}.
 */
export type RegionTileFilters = MapFiltersOf<typeof REGION_MAP_FILTERS>;

export const REGION_SOURCE_ID = 'regions';
const REGION_SOURCE_LAYER = 'regions';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	fill: mapDomain.region,
	outline: mapDomain.region,
	selected: mapInteraction.selected,
	selectedOutline: mapInteraction.selectedStroke,
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
	return tileTemplateUrl(serverUrl, REGION_SOURCE_ID, tileFilterQuery(REGION_MAP_FILTERS, filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildRegionExtentUrl(serverUrl: string, filters?: RegionTileFilters): string {
	return tileExtentUrl(serverUrl, REGION_SOURCE_ID, tileFilterQuery(REGION_MAP_FILTERS, filters));
}

/**
 * A filter that renders only features whose id is in `visibleIds`. When the set
 * is empty the expression matches nothing, so the map starts blank (all toggles
 * off) and each checkbox reveals its region without refetching tiles.
 *
 * Reads the `id` **property** (`['get', 'id']`), not the feature id (`['id']`):
 * the tiles are built with the 4-arg `ST_AsMVT`, which emits no native feature
 * id, and `promoteId` only backfills the id for feature-state / queried features
 * — a render-time layer filter still sees `feature.id === undefined`. Filtering
 * on `['id']` here would match nothing, so no region ever draws.
 *
 * Sorted, so that ticking a region off and back on leaves the expression it was:
 * `useTileLayer` reapplies a layer's filter when the filter changes, and the
 * order the ids arrive in is not a change.
 */
function regionVisibilityFilter(visibleIds: readonly string[]): ExpressionSpecification {
	return ['in', ['get', 'id'], ['literal', [...visibleIds].sort()]];
}

/**
 * The GL layers for the region source. `visibleIds` gates which regions draw;
 * `selectedId` adds a highlight on top of the visible ones.
 */
export function regionTileLayers(
	selectedId: string | null,
	visibleIds: readonly string[],
): (FillLayerSpecification | LineLayerSpecification)[] {
	const visible = regionVisibilityFilter(visibleIds);
	// Match the `id` property (see regionVisibilityFilter). An id no feature can
	// carry keeps the highlight layers empty when nothing is selected.
	const selected: ExpressionSpecification = [
		'all',
		visible,
		['==', ['get', 'id'], selectedId ?? ' '],
	];

	return [
		{
			id: `${REGION_SOURCE_ID}-fill`,
			type: 'fill',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: visible,
			paint: { 'fill-color': colors.fill, 'fill-opacity': 0.16 },
		},
		{
			id: `${REGION_SOURCE_ID}-outline`,
			type: 'line',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: visible,
			paint: {
				'line-color': colors.outline,
				'line-opacity': 0.72,
				'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 16, 2],
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected + visible feature ---
		{
			id: `${REGION_SOURCE_ID}-selected-fill`,
			type: 'fill',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: selected,
			paint: { 'fill-color': colors.selected, 'fill-opacity': 0.32 },
		},
		{
			id: `${REGION_SOURCE_ID}-selected-outline`,
			type: 'line',
			source: REGION_SOURCE_ID,
			'source-layer': REGION_SOURCE_LAYER,
			filter: selected,
			paint: { 'line-color': colors.selectedOutline, 'line-width': 3 },
		},
	];
}
