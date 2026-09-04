/**
 * The bulk region import's view of an uploaded KML, KMZ, or GeoJSON file: every
 * polygon in the file becomes one region, named after its Feature/Placemark.
 *
 * The parsing itself lives in `@simmer-mosquito/mapping` (shared with the record forms'
 * "fill geometry from a file" convenience); this module only adds the region-side
 * policy: polygons only, region naming, the `MAX_POLYGONS` cap, and withholding
 * shapes whose coordinates are not WGS84.
 */

import { getOwnedGeometryBaseTypes } from '@simmer-mosquito/domain';
import {
	collectImportGroups,
	flattenGeometries,
	type ImportGeometryKind,
	type ImportGroup,
	type ImportPolygonGeometry,
	importCandidatesFrom,
	isImportGeometryKind,
	isWgs84Geometry,
	parseGeoJsonGroups,
} from '@simmer-mosquito/mapping';

export { declareMissingNamespaces, parseKmlCoordinates } from '@simmer-mosquito/mapping';

export type ImportPolygon = ImportPolygonGeometry;

export interface ParsedRegion {
	readonly name: string;
	readonly geometry: ImportPolygon;
}

export interface ParseResult {
	readonly regions: ParsedRegion[];
	/** Non-polygon geometries (points, lines, empties) that were ignored. */
	readonly skipped: number;
	/** True when the file held more than `MAX_POLYGONS` and only the first were kept. */
	readonly truncated: boolean;
	/**
	 * Polygons withheld because their coordinates are not WGS84 lng/lat. Agency
	 * exports are often in State Plane feet or UTM metres, which parse as valid
	 * GeoJSON and land nowhere on earth: every write would fail the domain
	 * position validator, and the preview map would fit to nothing.
	 */
	readonly projected: number;
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/** Hard cap on how many polygons a single import may contribute. */
export const MAX_POLYGONS = 1000;

/**
 * What a Region may store, filtered to what the file parser can produce.
 *
 * Read from the register rather than named here, so widening a Region's shapes
 * is one edit in `packages/domain` and not a second one nobody finds. The filter
 * is what stops a shape the register allows and the parser has no arm for from
 * being asked for.
 */
const REGION_IMPORT_KINDS: readonly ImportGeometryKind[] =
	getOwnedGeometryBaseTypes('region').filter(isImportGeometryKind);

export function parseRegionsFromFile(text: string, fileName: string): ParseResult {
	const { groups, error } = collectImportGroups(text, fileName, REGION_IMPORT_KINDS);
	if (error !== undefined) {
		return { regions: [], skipped: 0, truncated: false, projected: 0, error };
	}
	return finalize(groups);
}

export function parseGeoJson(text: string): ParseResult {
	return finalize(parseGeoJsonGroups(text, REGION_IMPORT_KINDS));
}

/** Flatten any GeoJSON geometry into the polygons it contains. */
export function flattenPolygons(geometry: unknown): ImportPolygon[] {
	return flattenGeometries(geometry, REGION_IMPORT_KINDS).filter(isPolygon);
}

function finalize(groups: readonly ImportGroup[]): ParseResult {
	const { candidates, skipped, truncated } = importCandidatesFrom(groups, {
		limit: MAX_POLYGONS,
		fallbackName: 'Region',
	});
	const polygons = candidates.flatMap((candidate) =>
		isPolygon(candidate.geometry) ? [{ name: candidate.name, geometry: candidate.geometry }] : [],
	);
	const regions = polygons.filter((region) => isWgs84Geometry(region.geometry));
	return { regions, skipped, truncated, projected: polygons.length - regions.length };
}

function isPolygon(geometry: { readonly type: string }): geometry is ImportPolygon {
	return geometry.type === 'Polygon';
}
