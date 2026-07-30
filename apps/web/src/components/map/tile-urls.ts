/**
 * Shared URL shapes for the authenticated map tilesets. Each domain module keeps
 * its own filter → query-param mapping and builds both URLs from that one set, so
 * the tiles a map draws and the extent it frames can never fall out of step.
 */

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
