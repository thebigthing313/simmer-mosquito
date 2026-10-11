/**
 * Shared URL shapes for the authenticated map tilesets. Each domain module
 * builds both URLs from one query, encoded off its spec in
 * `@simmer-mosquito/domain`, so the tiles a map draws and the extent it frames
 * can never fall out of step.
 */

import { trimTrailingSlash } from '@simmer-mosquito/config';
import {
	encodeMapFilterParams,
	type MapFilterSpec,
	type MapFiltersOf,
} from '@simmer-mosquito/domain';

/**
 * A tileset's filters as its query, encoded by the spec the server parses them
 * with. No filters, or none set, is an empty query, which is what tells the
 * explorer its rail is empty for "none" rather than for "filters".
 */
export function tileFilterQuery<const TSpec extends MapFilterSpec>(
	spec: TSpec,
	filters: MapFiltersOf<TSpec> | undefined,
): URLSearchParams {
	return new URLSearchParams(
		filters === undefined ? undefined : encodeMapFilterParams(spec, filters),
	);
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
