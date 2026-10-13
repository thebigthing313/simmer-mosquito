import { type RawBuilder, sql } from 'kysely';

// --- region membership --------------------------------------------------------
//
// A region is the organization's own operational geography — a district, a
// zone, a city boundary — and "only show me this district" is a question every
// explorer gets asked. No record carries a region column: a habitat belongs to
// a district by *where it is*, so membership is a spatial test against the
// region boundary rather than a foreign key, and it stays correct the moment a
// boundary is redrawn.
//
// The predicate is shared by every map surface and by the detail-page read that
// asks the inverse question, so the tiles, the paged list, the framed extent and
// the regions band can never disagree about which regions hold a record.

/**
 * Match records whose geometry falls inside any of `regionIds`.
 *
 * The rule has three parts. A point is inside a region when it shares any point
 * with it, including a boundary. A line is inside when it shares any point with
 * it, so a habitat line running across a district boundary is still work in that
 * district and is not dropped for also leaving. An area is inside only when the
 * two *interiors* meet and the overlap covers at least
 * `REGION_AREA_OVERLAP_SHARE` of the smaller of the two areas, so an area that
 * shares an edge with a district, or overlaps it by a digitizing sliver, is next
 * to the district rather than in it.
 *
 * Area means Polygon or MultiPolygon. A MultiPolygon's interior is the union of
 * its parts' interiors, so a record with one part interior-inside is a member and
 * a record whose every part only abuts the boundary is not. MultiPoint and
 * MultiLineString stay on plain intersection for the reason their single-part
 * forms do.
 *
 * ADR 0015 has the reasoning and the alternatives that were rejected, its
 * 2026-09-03 amendment has the multipart half, and its 2026-10-13 amendment has
 * the threshold.
 */
export function regionMembershipClause(input: {
	/** The record's geometry column, e.g. ``sql`h.geom` ``. */
	readonly geom: RawBuilder<unknown>;
	/**
	 * The record's `geom_type` column, e.g. ``sql`h.geom_type` ``. A generated
	 * stored column of `lower(st_geometrytype(geom))`, so it cannot drift from the
	 * geometry it describes and reading it is free.
	 *
	 * Required rather than optional with a fallback: TypeScript then forces every
	 * call site to supply it, and an eleventh cannot get the wrong branch by
	 * omission.
	 */
	readonly geomType: RawBuilder<unknown>;
	/**
	 * The record's organization column, e.g. ``sql`h.organization_id` ``. The
	 * region set is scoped to the record's own organization rather than to a
	 * separately passed id, so a region id belonging to another organization can
	 * never widen a filtered read.
	 */
	readonly organizationId: RawBuilder<unknown>;
	readonly regionIds: readonly string[];
}): RawBuilder<boolean> {
	// `rf` rather than `r`: the region tileset's own reads already alias regions
	// as `r`, and this clause has to be safe to drop into any of them.
	//
	// The explicit `&&` is what reaches `regions_geom_gist_idx`. `ST_Relate` does
	// not include an index call of its own, because relationships like Disjoint
	// hold for geometries that do not intersect, so without it every live region pays a
	// full GEOS relate. `deleted_at is null` is load-bearing for the same reason
	// as well as for correctness: that index is partial on it.
	return sql<boolean>`exists (
		select 1
		from regions rf
		where rf.id = any(${[...input.regionIds]}::uuid[])
			and rf.organization_id = ${input.organizationId}
			and rf.deleted_at is null
			and rf.geom && ${input.geom}
			and ${regionMembershipMatch({
				geom: input.geom,
				geomType: input.geomType,
				regionGeom: sql`rf.geom`,
			})}
	)`;
}

/**
 * The share of the smaller area two areas must have in common to be members of
 * each other: 0.1%.
 *
 * Measured on the production clone of 2026-08-24 (#1671): sixteen digitizing
 * slivers between Plainsboro and its neighbours reached at most 0.034% of the
 * smaller area, and thirteen real overlaps started at 0.48%. The corpus carries
 * the same number as `AREA_OVERLAP_SHARE`, and the integration suite holds the
 * two equal.
 */
export const REGION_AREA_OVERLAP_SHARE = 0.001;

/**
 * The branch itself, without the region set around it.
 *
 * Split out so the detail-page read can scope the region set its own way, every
 * live region of the caller's organization rather than a chosen few, and still
 * run the same test the multiselect runs. Two surfaces answering the same
 * question differently about one record is the failure ADR 0015 exists to
 * prevent.
 *
 * The caller supplies `&&` and the soft-delete filter; this is only the exact
 * test that follows them.
 */
export function regionMembershipMatch(input: {
	readonly geom: RawBuilder<unknown>;
	readonly geomType: RawBuilder<unknown>;
	/** The region's geometry column, e.g. ``sql`rf.geom` ``. */
	readonly regionGeom: RawBuilder<unknown>;
}): RawBuilder<boolean> {
	// The area arm asks two things. `st_relate(..., 'T********')` is the DE-9IM
	// cell for "the interiors intersect" and nothing else, and it answers the
	// boundary-only and disjoint pairs before any overlay runs, which is most of
	// what the `&&` prefilter lets through. The measured share is what separates
	// a sliver from a real overlap; `st_area` here is in square degrees, which is
	// fine for a ratio between two shapes in one place.
	//
	// The record is read through `st_makevalid` where it is invalid, and only
	// there. The Split gesture writes two pieces sharing the line they were cut
	// along (#518), which OGC calls invalid, and `st_intersection` can throw a
	// TopologyException on an invalid input. Its polygonal part is kept so a
	// stray line from the repair cannot reach the area sum. The region side
	// needs no wrapping: `regions_geom_valid_check` holds it valid.
	//
	// The areal set is two literal names rather than a normalization. A
	// `replace(geom_type, 'st_multi', 'st_')` is a string trick that only looks
	// like one, and `normalizeGeomType` is not callable here: `packages/db`
	// carries `@simmer-mosquito/mapping` as a devDependency. The set is closed at
	// two, because GeometryCollection is not a record geometry.
	return sql<boolean>`case
		when ${input.geomType} in ('st_polygon', 'st_multipolygon')
			then exists (
				select 1
				from (
					select case
						when st_isvalid(${input.geom}) then ${input.geom}
						else st_collectionextract(st_makevalid(${input.geom}), 3)
					end as geom
				) record_area
				where st_relate(${input.regionGeom}, record_area.geom, 'T********')
					and st_area(st_intersection(${input.regionGeom}, record_area.geom))
						>= ${sql.lit(REGION_AREA_OVERLAP_SHARE)}
							* least(st_area(${input.regionGeom}), st_area(record_area.geom))
			)
		else st_intersects(${input.regionGeom}, ${input.geom})
	end`;
}

/**
 * The clause for `filters.regionIds`, or nothing when no region is selected.
 * Spread into a where-clause list so each reader stays a flat list of predicates.
 */
export function regionMembershipClauses(input: {
	readonly geom: RawBuilder<unknown>;
	readonly geomType: RawBuilder<unknown>;
	readonly organizationId: RawBuilder<unknown>;
	readonly regionIds: readonly string[] | undefined;
}): RawBuilder<boolean>[] {
	const regionIds = input.regionIds;
	if (regionIds === undefined || regionIds.length === 0) {
		return [];
	}
	return [
		regionMembershipClause({
			geom: input.geom,
			geomType: input.geomType,
			organizationId: input.organizationId,
			regionIds,
		}),
	];
}
