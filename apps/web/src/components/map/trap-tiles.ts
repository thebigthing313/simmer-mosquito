import { mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
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
	selected: mapInteraction.selected,
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
export function trapTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(TRAP_SOURCE_ID, { fill: statusColor, line: statusColor }, selectedId);
}
