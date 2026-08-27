import { mapDomain, mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
	selectedLayerIds,
} from './geometry-tiles';
import {
	type RegionScopedTileFilters,
	setRegionTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the habitat vector tiles. Mirrors the query params the
 * `/map/tiles/habitats/{z}/{x}/{y}.mvt` endpoint understands; the same shape
 * drives the `/map/habitats` bbox list so the map and the list stay in lockstep.
 */
export interface HabitatTileFilters extends RegionScopedTileFilters {
	readonly isActive?: boolean;
	readonly isInaccessible?: boolean;
	readonly habitatTypeIds?: readonly string[];
	readonly tagIds?: readonly string[];
	readonly search?: string;
}

export const HABITAT_SOURCE_ID = 'habitats';
const _HABITAT_SOURCE_LAYER = 'habitats';

/**
 * What each habitat status paints, and the only place it is written down.
 *
 * The legend imports this rather than restating the colours. DESIGN.md calls
 * that the Legend Truth Rule: a hand-typed swatch drifted into describing a
 * colour that was not on the map and stayed wrong, because a legend looks
 * correct as long as it looks plausible.
 */
export const HABITAT_STATUS_COLORS = {
	active: mapLifecycle.active,
	inactive: mapLifecycle.inactive,
	inaccessible: mapLifecycle.inaccessible,
} as const;

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	...HABITAT_STATUS_COLORS,
	line: mapDomain.connector,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a habitat. Order = hit priority. */
export const HABITAT_INTERACTIVE_LAYER_IDS = interactiveLayerIds(HABITAT_SOURCE_ID);

const HABITAT_SELECTED_LAYER_IDS = selectedLayerIds(HABITAT_SOURCE_ID);

export const HABITAT_LAYER_IDS = allLayerIds(HABITAT_SOURCE_ID);

const statusColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isInaccessible'], false],
	colors.inaccessible,
	['boolean', ['get', 'isActive'], true],
	colors.active,
	colors.inactive,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildHabitatTileUrl(serverUrl: string, filters?: HabitatTileFilters): string {
	return tileTemplateUrl(serverUrl, HABITAT_SOURCE_ID, habitatTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildHabitatExtentUrl(serverUrl: string, filters?: HabitatTileFilters): string {
	return tileExtentUrl(serverUrl, HABITAT_SOURCE_ID, habitatTileParams(filters));
}

function habitatTileParams(filters?: HabitatTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.isActive !== undefined) {
		params.set('isActive', String(filters.isActive));
	}
	if (filters?.isInaccessible !== undefined) {
		params.set('isInaccessible', String(filters.isInaccessible));
	}
	if (filters?.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		params.set('habitatTypeId', [...filters.habitatTypeIds].sort().join(','));
	}
	if (filters?.tagIds !== undefined && filters.tagIds.length > 0) {
		params.set('tagId', [...filters.tagIds].sort().join(','));
	}
	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		params.set('search', search);
	}

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the habitat source. `selectedId` drives the highlight set. */
export function habitatTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		HABITAT_SOURCE_ID,
		{ fill: statusColor, outline: colors.active, line: colors.line },
		selectedId,
	);
}

export { HABITAT_SELECTED_LAYER_IDS };
