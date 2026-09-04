import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import type { CircleLayerSpecification, ExpressionSpecification } from 'mapbox-gl';
import {
	type RegionScopedTileFilters,
	setRegionTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the address vector tiles. Mirrors the query params the
 * `/map/tiles/addresses/{z}/{x}/{y}.mvt` endpoint understands; the same `search`
 * drives the address-book list so the map and the list stay in lockstep.
 */
export interface AddressTileFilters extends RegionScopedTileFilters {
	readonly search?: string;
}

export const ADDRESS_SOURCE_ID = 'addresses';
const ADDRESS_SOURCE_LAYER = 'addresses';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	point: mapDomain.address,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
	selectedStroke: mapInteraction.selectedStroke,
} as const;

/** Layers the user can click to select an address. */
export const ADDRESS_INTERACTIVE_LAYER_IDS = [`${ADDRESS_SOURCE_ID}-points`] as const;

const ADDRESS_SELECTED_LAYER_IDS = [`${ADDRESS_SOURCE_ID}-selected-point`] as const;

export const ADDRESS_LAYER_IDS = [
	`${ADDRESS_SOURCE_ID}-points`,
	...ADDRESS_SELECTED_LAYER_IDS,
] as const;

/** Build the tile template URL with the active filters folded into the query. */
export function buildAddressTileUrl(serverUrl: string, filters?: AddressTileFilters): string {
	return tileTemplateUrl(serverUrl, ADDRESS_SOURCE_ID, addressTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildAddressExtentUrl(serverUrl: string, filters?: AddressTileFilters): string {
	return tileExtentUrl(serverUrl, ADDRESS_SOURCE_ID, addressTileParams(filters));
}

function addressTileParams(filters?: AddressTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		params.set('search', search);
	}

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the address source. `selectedId` drives the highlight. */
export function addressTileLayers(selectedId: string | null): CircleLayerSpecification[] {
	// Match the `id` property, not the feature id: tiles use the 4-arg ST_AsMVT (no
	// native feature id) and promoteId doesn't reach render-time filters, so `['id']`
	// evaluates to undefined here. An id no feature can carry keeps this empty when
	// nothing is selected.
	const matchesSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId ?? ' '];

	return [
		{
			id: `${ADDRESS_SOURCE_ID}-points`,
			type: 'circle',
			source: ADDRESS_SOURCE_ID,
			'source-layer': ADDRESS_SOURCE_LAYER,
			paint: {
				'circle-color': colors.point,
				'circle-opacity': 0.9,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${ADDRESS_SOURCE_ID}-selected-point`,
			type: 'circle',
			source: ADDRESS_SOURCE_ID,
			'source-layer': ADDRESS_SOURCE_LAYER,
			filter: matchesSelected,
			paint: {
				'circle-color': colors.selected,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 16, 10],
				'circle-stroke-color': colors.selectedStroke,
				'circle-stroke-width': 2.5,
			},
		},
	];
}
