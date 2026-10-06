/**
 * Shared URL shapes for the authenticated map tilesets. Each domain module keeps
 * its own filter → query-param mapping and builds both URLs from that one set, so
 * the tiles a map draws and the extent it frames can never fall out of step.
 */

import { trimTrailingSlash } from '@simmer-mosquito/config';

/**
 * The region narrowing every record tileset accepts.
 *
 * Regions are the organization's own operational geography, so "only this
 * district" is asked of habitats, traps, applications, and everything else
 * alike. One shape and one param name across every tileset keeps a region deep
 * link into one explorer readable by the next.
 */
export interface RegionScopedTileFilters {
	/** Show only records falling inside these regions. Empty means every region. */
	readonly regionIds?: readonly string[];
}

/** Fold the region narrowing into a tileset's query, under the shared param. */
export function setRegionTileParam(
	params: URLSearchParams,
	regionIds: readonly string[] | undefined,
): void {
	setIdListTileParam(params, 'regionId', regionIds);
}

/**
 * Fold a list of ids into a tileset's query as one comma-joined param, or leave
 * the query alone when there are none.
 */
export function setIdListTileParam(
	params: URLSearchParams,
	name: string,
	ids: readonly string[] | undefined,
): void {
	if (ids === undefined || ids.length === 0) {
		return;
	}
	// Sorted so re-selecting the same ids in a different order leaves the URL,
	// and therefore the tile source, untouched.
	params.set(name, [...ids].sort().join(','));
}

/** Fold a search term into a tileset's query, trimmed, or nothing for a blank one. */
export function setTextTileParam(
	params: URLSearchParams,
	name: string,
	value: string | undefined,
): void {
	const trimmed = value?.trim();
	if (trimmed !== undefined && trimmed.length > 0) {
		params.set(name, trimmed);
	}
}

/** How a tileset's tiles draw, as opposed to which records they hold. */
export interface TileDrawOptions {
	/**
	 * Ask for points grouped by grid cell. Only a tileset the server lets
	 * cluster takes it; any other answers 400.
	 */
	readonly cluster?: boolean;
}

/**
 * The vector-tile template for one tileset, with the filters folded in.
 *
 * Clustering rides on the tile URL alone and never on the extent's, so a
 * clustered and a plain tile cache under two URLs and never mix, while the
 * extent the camera frames stays the one URL it was.
 */
export function tileTemplateUrl(
	serverUrl: string,
	tileset: string,
	params: URLSearchParams,
	options?: TileDrawOptions,
): string {
	const query = new URLSearchParams(params);
	if (options?.cluster === true) {
		query.set('cluster', '1');
	}
	return withQuery(`${trimTrailingSlash(serverUrl)}/map/tiles/${tileset}/{z}/{x}/{y}.mvt`, query);
}

/**
 * The extent endpoint for one tileset: the bounding box of every row the same
 * filters select, regardless of the current viewport.
 */
export function tileExtentUrl(serverUrl: string, tileset: string, params: URLSearchParams): string {
	return withQuery(`${trimTrailingSlash(serverUrl)}/map/tiles/${tileset}/extent`, params);
}

function withQuery(base: string, params: URLSearchParams): string {
	const query = params.toString();
	return query.length === 0 ? base : `${base}?${query}`;
}
