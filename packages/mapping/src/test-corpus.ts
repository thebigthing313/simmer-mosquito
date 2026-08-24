/**
 * The region-membership corpus: geometry pairs and the answer each one must get.
 *
 * ADR 0015 gives one membership rule two implementations — SQL for web, and a
 * TypeScript predicate for mobile when `apps/mobile` arrives. Neither is the
 * source of truth. This file is. Both halves are held to it, so a disagreement
 * between them is a failing case here rather than a field report.
 *
 * **Every expectation below is hand-written and reviewed.** None of them came
 * out of PostGIS. A corpus PostGIS wrote could only confirm that PostGIS agrees
 * with itself, and the TypeScript half would inherit whatever GEOS does at the
 * edges instead of the rule the team decided.
 *
 * The rule, restated once: a record is inside a region when their geometries
 * meet, except that area against area needs their **interiors** to meet.
 * Boundary-only contact is excluded there and nowhere else, because a point or
 * a line has no other kind of contact to offer.
 *
 * ## Why the geometry looks like this
 *
 * One shared region, an axis-aligned square with a square hole, at realistic
 * WGS84 magnitudes near longitude -90. Doubles hold about 1e-14 there, so the
 * magnitudes are nearly free and the cases stay readable.
 *
 * Every boundary case is built from a coordinate that appears literally in the
 * region ring, or lies on an axis-aligned edge whose fixed ordinate is one of
 * those literals. A derived point on an edge is a different double in each
 * implementation, and the corpus would become an argument about tolerance;
 * built this way the boundary cases are exact and no tolerance is needed at all.
 * The single exception is `line-crossing-boundary`, whose crossing point is
 * derived — and that case answers true under every rule, so precision never
 * decides it.
 *
 * The hole is first-class rather than a variant. `ImportPolygonGeometry` is
 * `[outer ring, ...holes]`, so a KML or GeoJSON upload brings one in, and holes
 * are where the two implementations are most likely to part company:
 * `polygonContainsLngLat` already counts a hole's edge as inside, and a naive
 * port would not.
 *
 * ## What is deliberately absent
 *
 * No multipart or collection geometry. Nine of the fifteen geom tables carry
 * `check (geometrytype(geom) in ('POINT','LINESTRING','POLYGON'))` and the other
 * six are typed by their column modifier, and `packages/mapping` flattens
 * multipart input before a candidate is offered. Testing input the schema
 * forbids invites someone to make the test pass by relaxing the schema.
 *
 * No empty geometry. `POLYGON EMPTY` passes both `not null` and the
 * `geometrytype` check and is stopped only by the domain validator, on the write
 * path. The predicate answers false for it under either branch, so it is a
 * schema gap worth knowing about rather than a rule to pin down here.
 */

import type { GeoJsonLineString, GeoJsonPoint, GeoJsonPolygon } from './geometry.js';

/**
 * Which arm of the rule a case must take.
 *
 * Asserted alongside the boolean, and not redundant with it. A polygon record
 * wrongly routed through plain intersection answers correctly on every case here
 * except `polygon-sharing-one-edge`, so without this field one case out of
 * twenty-two is the whole defence against a misroute.
 */
export type MembershipBranch = 'plain-intersection' | 'interior-intersection';

/** The three dimensions a record's geometry can have. A `geom_type`, verbatim. */
export type CorpusGeomType = 'st_point' | 'st_linestring' | 'st_polygon';

export interface CorpusCase {
	/** Stable slug. It appears in failure output, so it has to read as a sentence. */
	readonly id: string;
	readonly geomType: CorpusGeomType;
	readonly branch: MembershipBranch;
	readonly record: GeoJsonPoint | GeoJsonLineString | GeoJsonPolygon;
	/**
	 * The region this case runs against. Omitted means `CORPUS_REGION`. A case
	 * names its own only when the shared region cannot express it, so invented
	 * geometry is visible rather than quiet. Nothing needs one today.
	 */
	readonly region?: GeoJsonPolygon;
	readonly inside: boolean;
	/** Why the answer is what it is. Read this before changing an expectation. */
	readonly because: string;
}

/**
 * The shared region. An outer square with a square hole.
 *
 * Outer: lng -90.00 to -89.90, lat 30.00 to 30.10.
 * Hole: lng -89.97 to -89.94, lat 30.03 to 30.06.
 *
 * `regions.geom` is `geometry(Polygon, 4326)`, so the region side never varies
 * in dimension and only the record side does.
 */
export const CORPUS_REGION: GeoJsonPolygon = {
	type: 'Polygon',
	coordinates: [
		[
			[-90.0, 30.0],
			[-89.9, 30.0],
			[-89.9, 30.1],
			[-90.0, 30.1],
			[-90.0, 30.0],
		],
		[
			[-89.97, 30.03],
			[-89.97, 30.06],
			[-89.94, 30.06],
			[-89.94, 30.03],
			[-89.97, 30.03],
		],
	],
};

const point = (lng: number, lat: number): GeoJsonPoint => ({
	type: 'Point',
	coordinates: [lng, lat],
});

const line = (...coordinates: readonly (readonly [number, number])[]): GeoJsonLineString => ({
	type: 'LineString',
	coordinates,
});

/** An axis-aligned rectangle, wound counter-clockwise. */
const box = (west: number, south: number, east: number, north: number): GeoJsonPolygon => ({
	type: 'Polygon',
	coordinates: [
		[
			[west, south],
			[east, south],
			[east, north],
			[west, north],
			[west, south],
		],
	],
});

const POINT_CASES: readonly CorpusCase[] = [
	{
		id: 'point-inside',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-89.92, 30.02),
		inside: true,
		because: 'Well inside the outer ring and clear of the hole. The ordinary case.',
	},
	{
		id: 'point-on-edge',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-89.95, 30.0),
		inside: true,
		because:
			'On the southern edge, which is the only contact a point can make. Excluding it ' +
			'would put a trap on a district line in no district.',
	},
	{
		id: 'point-on-vertex',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-90.0, 30.0),
		inside: true,
		because: 'A ring vertex, verbatim. Boundary contact counts for a point.',
	},
	{
		id: 'point-outside',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-89.8, 30.02),
		inside: false,
		because: 'East of the outer ring, sharing nothing with it.',
	},
	{
		id: 'point-in-hole',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-89.955, 30.045),
		inside: false,
		because: 'A hole is not part of the region, so a point in one is outside it.',
	},
	{
		id: 'point-on-hole-edge',
		geomType: 'st_point',
		branch: 'plain-intersection',
		record: point(-89.955, 30.03),
		inside: true,
		because:
			"A hole's edge is region boundary, and boundary contact counts for a point. This is " +
			'the case a naive port of `polygonContainsLngLat` gets wrong.',
	},
];

const LINE_CASES: readonly CorpusCase[] = [
	{
		id: 'line-crossing-boundary',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.95, 29.98], [-89.95, 30.02]),
		inside: true,
		because:
			'Runs in across the southern edge. The one case whose crossing point is derived ' +
			'rather than literal, and it answers true under every rule, so precision cannot ' +
			'decide it.',
	},
	{
		id: 'line-wholly-inside',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.93, 30.02], [-89.92, 30.02]),
		inside: true,
		because: 'Both ends and everything between them sit inside the outer ring.',
	},
	{
		id: 'line-wholly-outside',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.8, 30.02], [-89.79, 30.02]),
		inside: false,
		because: 'East of the outer ring end to end.',
	},
	{
		id: 'line-along-edge',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.98, 30.0], [-89.95, 30.0]),
		inside: true,
		because:
			'Lies along the southern edge and touches the region nowhere else. A line running ' +
			'down a district boundary is work on that boundary, so it stays inside.',
	},
	{
		id: 'line-touching-at-node',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-90.02, 29.98], [-90.0, 30.0]),
		inside: true,
		because: 'Outside except for an endpoint sitting on the south-west ring vertex.',
	},
	{
		id: 'line-in-and-out-same-edge',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.95, 29.99], [-89.94, 30.01], [-89.93, 29.99]),
		inside: true,
		because: 'Enters and leaves through the southern edge, with its middle node inside.',
	},
	{
		id: 'line-crossing-hole',
		geomType: 'st_linestring',
		branch: 'plain-intersection',
		record: line([-89.98, 30.045], [-89.92, 30.045]),
		inside: true,
		because:
			'Passes straight through the hole, but the stretches on either side of it are inside ' +
			'the region. The hole removes part of the line, not the answer.',
	},
];

const POLYGON_CASES: readonly CorpusCase[] = [
	{
		id: 'polygon-overlapping',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-90.02, 30.02, -89.98, 30.04),
		inside: true,
		because: 'Straddles the western edge, so the two interiors genuinely overlap.',
	},
	{
		id: 'polygon-wholly-inside',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-89.93, 30.01, -89.91, 30.02),
		inside: true,
		because:
			'Drawn wholly inside the region. `ST_Overlaps` would drop this one, which is why ' +
			'the rule is the DE-9IM interior cell and not a named predicate.',
	},
	{
		id: 'polygon-containing-region',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-90.1, 29.9, -89.8, 30.2),
		inside: true,
		because: 'Swallows the region. The interiors meet, so the record is in the region.',
	},
	{
		id: 'polygon-sharing-one-edge',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-90.0, 29.98, -89.9, 30.0),
		inside: false,
		because:
			'Sits south of the region sharing the whole southern edge and overlapping it ' +
			'nowhere. This is work next to the district, not in it, and it is the single case ' +
			'that separates the two branches.',
	},
	{
		id: 'polygon-sharing-one-vertex',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-90.02, 29.98, -90.0, 30.0),
		inside: false,
		because: 'Meets the region at the south-west vertex and nowhere else. No interior contact.',
	},
	{
		id: 'polygon-identical',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: CORPUS_REGION,
		inside: true,
		because:
			'The same ring and the same hole. Equality is interior contact, which is why the ' +
			'rule is the union of Within, Contains, Equals and Overlaps rather than any one ' +
			'of them.',
	},
	{
		id: 'polygon-disjoint',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-89.8, 30.02, -89.78, 30.04),
		inside: false,
		because: 'East of the region, touching nothing.',
	},
	{
		id: 'polygon-in-hole',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-89.96, 30.04, -89.95, 30.05),
		inside: false,
		because: 'Entirely inside the hole, which is outside the region.',
	},
	{
		id: 'polygon-on-hole-edge',
		geomType: 'st_polygon',
		branch: 'interior-intersection',
		record: box(-89.96, 30.03, -89.95, 30.04),
		inside: false,
		because:
			"Sits in the hole with its southern edge along the hole's southern edge. The contact " +
			'is boundary only and the interior is in the hole, so it is outside.',
	},
];

/**
 * Every case. Twenty-two of them, and `REGION_MEMBERSHIP_CORPUS_SIZE` is checked
 * in beside the list so a case lost to a bad merge fails rather than quietly
 * shrinking the suite.
 */
export const REGION_MEMBERSHIP_CORPUS: readonly CorpusCase[] = [
	...POINT_CASES,
	...LINE_CASES,
	...POLYGON_CASES,
];

export const REGION_MEMBERSHIP_CORPUS_SIZE = 22;

/** The branch a `geom_type` takes. The rule, in one place, for both halves. */
export function membershipBranchFor(geomType: string): MembershipBranch {
	return geomType === 'st_polygon' ? 'interior-intersection' : 'plain-intersection';
}

/** The region a case runs against: its own if it named one, the shared one otherwise. */
export function corpusRegionFor(corpusCase: CorpusCase): GeoJsonPolygon {
	return corpusCase.region ?? CORPUS_REGION;
}
