/**
 * Shared URL shapes for the authenticated map tilesets. Each domain module keeps
 * its own filter → query-param mapping and builds both URLs from that one set, so
 * the tiles a map draws and the extent it frames can never fall out of step.
 */

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
	if (regionIds === undefined || regionIds.length === 0) {
		return;
	}
	// Sorted so re-selecting the same regions in a different order leaves the URL
	// — and therefore the tile source — untouched.
	params.set('regionId', [...regionIds].sort().join(','));
}

/** The vector-tile template for one tileset, with the filters folded in. */
export function tileTemplateUrl(
	serverUrl: string,
	tileset: string,
	params: URLSearchParams,
): string {
	return withQuery(`${trimTrailingSlash(serverUrl)}/map/tiles/${tileset}/{z}/{x}/{y}.mvt`, params);
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

function trimTrailingSlash(serverUrl: string): string {
	return serverUrl.replace(/\/+$/, '');
}
