import { mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, TRAP_MAP_FILTERS } from '@simmer-mosquito/domain';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `traps` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type TrapTileFilters = MapFiltersOf<typeof TRAP_MAP_FILTERS>;

export const TRAP_SOURCE_ID = 'traps';

/**
 * What each trap status paints, and the only place it is written down.
 *
 * The key and the result rail import this rather than restating the colours.
 * DESIGN.md calls that the Legend Truth Rule: a hand-typed swatch drifted into
 * describing a colour that was not on the map and stayed wrong, because a
 * legend looks correct as long as it looks plausible.
 */
export const TRAP_STATUS_COLORS = {
	active: mapLifecycle.active,
	inactive: mapLifecycle.inactive,
} as const;

/**
 * Map paint colors. Traps carry an `isActive` feature property, so points read
 * their status straight off the map. Kept as literals: GL paint can't read CSS
 * custom props.
 */
const colors = {
	...TRAP_STATUS_COLORS,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a trap. Order = hit priority. */
export const TRAP_INTERACTIVE_LAYER_IDS = interactiveLayerIds(TRAP_SOURCE_ID);

export const TRAP_LAYER_IDS = allLayerIds(TRAP_SOURCE_ID);

// A trap with no recorded `isActive` reads as active — the common case.
const statusColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isActive'], true],
	colors.active,
	colors.inactive,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildTrapTileUrl(
	serverUrl: string,
	filters?: TrapTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		TRAP_SOURCE_ID,
		tileFilterQuery(TRAP_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildTrapExtentUrl(serverUrl: string, filters?: TrapTileFilters): string {
	return tileExtentUrl(serverUrl, TRAP_SOURCE_ID, tileFilterQuery(TRAP_MAP_FILTERS, filters));
}

/** The GL layers for the trap source. `selectedId` drives the highlight set. */
export function trapTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(TRAP_SOURCE_ID, { fill: statusColor, line: statusColor }, selectedId);
}
