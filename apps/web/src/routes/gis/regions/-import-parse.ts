/**
 * The bulk region import's view of an uploaded KML, KMZ, or GeoJSON file: every
 * feature in the file becomes one region, named after its Feature/Placemark.
 *
 * The parsing itself lives in `@simmer-mosquito/mapping` (shared with the record forms'
 * "fill geometry from a file" convenience); this module only adds the region-side
 * policy: which shapes a Region may store, region naming, the `MAX_REGIONS` cap,
 * and withholding shapes whose coordinates are not WGS84.
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
 * What a Region's boundary may be, read off the register rather than named here.
 *
 * The parser's union narrowed to the shapes a Region stores, which is the same
 * list {@link REGION_IMPORT_KINDS} is filtered down to below. It used to be
 * `ImportArealGeometry`, a hand-written pair that agreed with the register by
 * coincidence: widen the policy and the filter widens with it, while this type
 * did not, and `boundaryPositions` in `import.tsx` would have read a Point's
 * `[lng, lat]` as a ring list with nothing failing to compile.
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
	 * Boundaries withheld because their coordinates are not WGS84 lng/lat. Exports
	 * from an Organization are often in State Plane feet or UTM metres, which
	 * parse as valid GeoJSON and land nowhere on earth: every write would fail the
	 * domain position validator, and the preview map would fit to nothing.
	 */
	readonly projected: number;
	/** Set when the file could not be parsed at all. */
	readonly error?: string;
}

/**
 * Hard cap on how many regions a single import may contribute.
 *
 * It counts features rather than pieces, because a feature is a write. A file of
 * 400 parks averaging three lots each costs 400 rather than 1200.
 */
export const MAX_REGIONS = 1000;

/**
 * What a Region may store, filtered to what the file parser can produce.
 *
 * Read from the register rather than named here, so widening a Region's shapes
 * is one edit in `packages/domain` and not a second one nobody finds. The filter
 * is what stops a shape the register allows and the parser has no arm for from
 * being asked for.
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
 * Whether a parsed shape is one a Region stores.
 *
 * The parser was already asked for these kinds and answers with nothing else, so
 * this is a narrowing rather than a second gate. Both halves come off the
 * register: the check reads the list the parser was handed, and
 * {@link RegionBoundary} is that list as a type.
 */
function isRegionBoundary(geometry: ImportGeometry): geometry is RegionBoundary {
	return REGION_IMPORT_KINDS.includes(geometry.type);
}
