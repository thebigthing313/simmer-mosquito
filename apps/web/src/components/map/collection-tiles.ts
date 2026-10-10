import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
import { COLLECTION_MAP_FILTERS, type MapFiltersOf } from '@simmer-mosquito/domain';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `collections` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type CollectionTileFilters = MapFiltersOf<typeof COLLECTION_MAP_FILTERS>;

export const COLLECTION_SOURCE_ID = 'collections';

/**
 * Status palette. Points are coloured by where a collection sits in the round:
 * amber while the trap is still out, red when a problem was reported, slate when
 * it came back empty, teal once it is in with specimens. Kept as literals (GL
 * paint can't read CSS custom props).
 *
 * The same four tones samples use, and for the same reason: the two surfaces sit
 * side by side under Adult Surveillance and Larval Surveillance, and a colour
 * that means "needs attention" on one must not mean something else on the other.
 */
const colors = {
	collected: mapStatus.resolved,
	pending: mapStatus.pending,
	zeroResult: mapStatus.neutral,
	problem: mapStatus.problem,
	pointStroke: mapInteraction.pointStroke,
} as const;

/**
 * The status colours, keyed by the status the server resolves, exported so the
 * key, the result rail's dot and the map ramp read from one place.
 */
/** The status the server resolves for a collection, by precedence. */
export type CollectionStatus = 'pending' | 'problem' | 'zero_result' | 'collected';

export const COLLECTION_STATUS_COLORS: Readonly<Record<CollectionStatus, string>> = {
	collected: colors.collected,
	pending: colors.pending,
	zero_result: colors.zeroResult,
	problem: colors.problem,
};

/** Layers the user can click to select a collection. Order = hit priority. */
export const COLLECTION_INTERACTIVE_LAYER_IDS = interactiveLayerIds(COLLECTION_SOURCE_ID);

export const COLLECTION_LAYER_IDS = allLayerIds(COLLECTION_SOURCE_ID);

// Colour by the server-resolved status property; an unexpected value falls to
// the collected tone, which is what a row with nothing flagged on it is.
const statusColor: ExpressionSpecification = [
	'match',
	['get', 'status'],
	'pending',
	colors.pending,
	'problem',
	colors.problem,
	'zero_result',
	colors.zeroResult,
	colors.collected,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildCollectionTileUrl(
	serverUrl: string,
	filters?: CollectionTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		COLLECTION_SOURCE_ID,
		tileFilterQuery(COLLECTION_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildCollectionExtentUrl(
	serverUrl: string,
	filters?: CollectionTileFilters,
): string {
	return tileExtentUrl(
		serverUrl,
		COLLECTION_SOURCE_ID,
		tileFilterQuery(COLLECTION_MAP_FILTERS, filters),
	);
}

/** The GL layers for the collection source. `selectedId` drives the highlight set. */
export function collectionTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		COLLECTION_SOURCE_ID,
		{ fill: statusColor, line: statusColor },
		selectedId,
	);
}
