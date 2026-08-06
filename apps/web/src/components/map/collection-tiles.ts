import { mapDomain, mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
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
 * Server-side filters for the collection vector tiles. Mirrors the query params
 * the `/map/tiles/collections/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/collections` paged list so the map and the list stay in
 * lockstep.
 */
export interface CollectionTileFilters extends RegionScopedTileFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Only collections flagged with a problem. */
	readonly problemOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on collection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on collection date. */
	readonly dateTo?: string;
}

export const COLLECTION_SOURCE_ID = 'collections';
const _COLLECTION_SOURCE_LAYER = 'collections';

/**
 * Map paint colors. Collections carry a `hasProblem` feature property, so points
 * read their status straight off the map — a flagged collection burns amber-red,
 * a clean one stays calm teal. Kept as literals: GL paint can't read CSS custom
 * props.
 */
const colors = {
	base: mapDomain.collection,
	problem: mapStatus.problem,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a collection. Order = hit priority. */
export const COLLECTION_INTERACTIVE_LAYER_IDS = interactiveLayerIds(COLLECTION_SOURCE_ID);

const COLLECTION_SELECTED_LAYER_IDS = selectedLayerIds(COLLECTION_SOURCE_ID);

export const COLLECTION_LAYER_IDS = allLayerIds(COLLECTION_SOURCE_ID);

// A collection with no recorded `hasProblem` reads as clean — the common case.
const problemColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'hasProblem'], false],
	colors.problem,
	colors.base,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildCollectionTileUrl(serverUrl: string, filters?: CollectionTileFilters): string {
	return tileTemplateUrl(serverUrl, COLLECTION_SOURCE_ID, collectionTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildCollectionExtentUrl(
	serverUrl: string,
	filters?: CollectionTileFilters,
): string {
	return tileExtentUrl(serverUrl, COLLECTION_SOURCE_ID, collectionTileParams(filters));
}

function collectionTileParams(filters?: CollectionTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		params.set('collectionMethodId', [...filters.collectionMethodIds].sort().join(','));
	}
	if (filters?.problemOnly === true) {
		params.set('problem', 'true');
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

/** The GL layers for the collection source. `selectedId` drives the highlight set. */
export function collectionTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		COLLECTION_SOURCE_ID,
		{ fill: problemColor, line: problemColor },
		selectedId,
	);
}

export { COLLECTION_SELECTED_LAYER_IDS };
