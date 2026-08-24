import { type RawBuilder, sql } from 'kysely';

// --- region membership --------------------------------------------------------
//
// A region is the agency's own operational geography — a district, a zone, a
// city boundary — and "only show me this district" is a question every explorer
// gets asked. No record carries a region column: a habitat belongs to a district
// by *where it is*, so membership is a spatial test against the region boundary
// rather than a foreign key, and it stays correct the moment a boundary is
// redrawn.
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
 * district and is not dropped for also leaving. A polygon is inside only when
 * the two *interiors* meet, so an area that shares an edge with a district and
 * overlaps it nowhere is work next to the district rather than in it.
 *
 * ADR 0015 has the reasoning and the alternatives that were rejected.
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
	 * The record's tenancy column, e.g. ``sql`h.organization_id` ``. The region set
	 * is scoped to the record's own agency rather than to a separately passed id,
	 * so a region id belonging to another agency can never widen a filtered read.
	 */
	readonly organizationId: RawBuilder<unknown>;
	readonly regionIds: readonly string[];
}): RawBuilder<boolean> {
	// `rf` rather than `r`: the region tileset's own reads already alias regions
	// as `r`, and this clause has to be safe to drop into any of them.
	//
	// The explicit `&&` is what reaches `regions_geom_gist_idx`. `ST_Relate` does
	// not include an index call of its own — relationships like Disjoint hold for
	// geometries that do not intersect — so without it every live region pays a
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
 * The branch itself, without the region set around it.
 *
 * Split out so the detail-page read can scope the region set its own way — every
 * live region of the caller's agency rather than a chosen few — and still run the
 * same test the multiselect runs. Two surfaces answering the same question
 * differently about one record is the failure ADR 0015 exists to prevent.
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
	// `'T********'` is the DE-9IM cell for "the interiors intersect" and nothing
	// else. No named PostGIS predicate replaces it: `ST_Overlaps` drops a polygon
	// drawn wholly inside a district, `ST_Contains` and `ST_Within` drop one
	// straddling a boundary, and `ST_Covers` counts the boundary-only case this
	// rule exists to exclude.
	return sql<boolean>`case
		when ${input.geomType} = 'st_polygon'
			then st_relate(${input.regionGeom}, ${input.geom}, 'T********')
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
