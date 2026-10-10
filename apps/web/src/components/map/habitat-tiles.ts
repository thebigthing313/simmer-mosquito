import { mapDomain, mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
import { HABITAT_MAP_FILTERS, type MapFiltersOf } from '@simmer-mosquito/domain';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `habitats` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type HabitatTileFilters = MapFiltersOf<typeof HABITAT_MAP_FILTERS>;

export const HABITAT_SOURCE_ID = 'habitats';

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
} as const;

/** Layers the user can click to select a habitat. Order = hit priority. */
export const HABITAT_INTERACTIVE_LAYER_IDS = interactiveLayerIds(HABITAT_SOURCE_ID);

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
export function buildHabitatTileUrl(
	serverUrl: string,
	filters?: HabitatTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		HABITAT_SOURCE_ID,
		tileFilterQuery(HABITAT_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildHabitatExtentUrl(serverUrl: string, filters?: HabitatTileFilters): string {
	return tileExtentUrl(serverUrl, HABITAT_SOURCE_ID, tileFilterQuery(HABITAT_MAP_FILTERS, filters));
}

/** The GL layers for the habitat source. `selectedId` drives the highlight set. */
export function habitatTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		HABITAT_SOURCE_ID,
		{ fill: statusColor, outline: colors.active, line: colors.line },
		selectedId,
	);
}
