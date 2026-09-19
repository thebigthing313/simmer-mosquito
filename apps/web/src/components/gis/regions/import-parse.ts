/**
 * The bulk region import's view of an uploaded KML, KMZ, or GeoJSON file:
 * every feature becomes one region, named after its Feature/Placemark. The
 * parsing is `@simmer-mosquito/mapping`'s; this adds the region-side policy:
 * which shapes a Region may store, naming, the `MAX_REGIONS` cap, and
 * withholding shapes whose coordinates are not WGS84.
 */

import { getOwnedGeometryPolicy, type OwnedGeometryTypeFor } from '@simmer-mosquito/domain';
import {
	collectImportGroups,
	type ImportGeometry,
	type ImportGeometryKind,
	type ImportGroup,
	type ImportNote,
	importCandidatesFrom,
	isImportGeometryKind,
	isWgs84Geometry,
	parseGeoJsonGroups,
} from '@simmer-mosquito/mapping';

export { declareMissingNamespaces, parseKmlCoordinates } from '@simmer-mosquito/mapping';

/**
 * What a Region's boundary may be: the parser's union narrowed to the shapes
 * the register says a Region stores, the same list {@link REGION_IMPORT_KINDS}
 * is filtered to.
 */
export type RegionBoundary = Extract<
	ImportGeometry,
	{ readonly type: OwnedGeometryTypeFor<'region'> }
>;

export interface ParsedRegion {
	readonly name: string;
	readonly geometry: RegionBoundary;
	/** What reading the feature dropped, where it dropped something. */
	readonly note: ImportNote | null;
}

export interface ParseResult {
	readonly regions: ParsedRegion[];
	/** Features of a kind a Region never stores (points, lines, empties). */
	readonly skipped: number;
	/** Features refused because a Region cannot hold their pieces. */
	readonly multipart: number;
	/** Features refused because they mix geometry kinds. */
	readonly mixed: number;
	/** True when the file held more than `MAX_REGIONS` and only the first were kept. */
	readonly truncated: boolean;
	/**
	 * Boundaries withheld because their coordinates are not WGS84 lng/lat. State
	 * Plane feet or UTM metres parse as valid GeoJSON and land nowhere on earth.
	 */
	readonly projected: number;
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/**
 * Hard cap on how many regions a single import may contribute. It counts
 * features rather than pieces, because a feature is a write.
 */
export const MAX_REGIONS = 1000;

/**
 * What a Region may store, filtered to what the file parser can produce. Read
 * from the register so widening a Region's shapes is one edit in
 * `packages/domain`.
 */
const REGION_IMPORT_KINDS: readonly ImportGeometryKind[] =
	getOwnedGeometryPolicy('region').allowedTypes.filter(isImportGeometryKind);

const EMPTY: ParseResult = {
	regions: [],
	skipped: 0,
	multipart: 0,
	mixed: 0,
	truncated: false,
	projected: 0,
};

export function parseRegionsFromFile(text: string, fileName: string): ParseResult {
	const { groups, error } = collectImportGroups(text, fileName, REGION_IMPORT_KINDS);
	if (error !== undefined) {
		return { ...EMPTY, error };
	}
	return finalize(groups);
}

export function parseGeoJson(text: string): ParseResult {
	return finalize(parseGeoJsonGroups(text, REGION_IMPORT_KINDS));
}

function finalize(groups: readonly ImportGroup[]): ParseResult {
	const { candidates, skipped, multipart, mixed, truncated } = importCandidatesFrom(groups, {
		limit: MAX_REGIONS,
		fallbackName: 'Region',
	});
	const boundaries = candidates.flatMap((candidate) =>
		isRegionBoundary(candidate.geometry)
			? [{ name: candidate.name, geometry: candidate.geometry, note: candidate.note }]
			: [],
	);
	const regions = boundaries.filter((region) => isWgs84Geometry(region.geometry));
	return {
		regions,
		skipped,
		multipart,
		mixed,
		truncated,
		projected: boundaries.length - regions.length,
	};
}

/**
 * Whether a parsed shape is one a Region stores. A narrowing rather than a
 * second gate: the parser was asked for these kinds and answers with nothing
 * else.
 */
function isRegionBoundary(geometry: ImportGeometry): geometry is RegionBoundary {
	return REGION_IMPORT_KINDS.includes(geometry.type);
}
