import { mapInteraction, mapLifecycle } from '@simmer-mosquito/design-tokens';
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
const _TRAP_SOURCE_LAYER = 'traps';

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
export const TRAP_INTERACTIVE_LAYER_IDS = interactiveLayerIds(TRAP_SOURCE_ID);

const TRAP_SELECTED_LAYER_IDS = selectedLayerIds(TRAP_SOURCE_ID);

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

export { TRAP_SELECTED_LAYER_IDS };
