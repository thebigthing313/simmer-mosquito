import { type RawBuilder, sql } from 'kysely';

// --- filtering a map surface by region ---------------------------------------
//
// A region is the agency's own operational geography — a district, a zone, a
// city boundary — and "only show me this district" is a question every explorer
// gets asked. No record carries a region column: a habitat belongs to a district
// by *where it is*, so membership is a spatial test against the region boundary
// rather than a foreign key, and it stays correct the moment a boundary is
// redrawn.
//
// The predicate is shared by every map surface so the tiles, the paged list, and
// the framed extent can never disagree about which records a region holds.

/**
 * Match records whose geometry falls inside any of `regionIds`.
 *
 * Membership is *intersection*, not containment: a habitat line that runs across
 * a district boundary is still work in that district, and dropping it because it
 * also leaves would hide it from the crew responsible for it.
 */
export function regionMembershipClause(input: {
	/** The record's geometry column, e.g. ``sql`h.geom` ``. */
	readonly geom: RawBuilder<unknown>;
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
	return sql<boolean>`exists (
		select 1
		from regions rf
		where rf.id = any(${[...input.regionIds]}::uuid[])
			and rf.organization_id = ${input.organizationId}
			and rf.deleted_at is null
			and rf.geom && ${input.geom}
			and st_intersects(rf.geom, ${input.geom})
	)`;
}

/**
 * The clause for `filters.regionIds`, or nothing when no region is selected.
 * Spread into a where-clause list so each reader stays a flat list of predicates.
 */
export function regionMembershipClauses(input: {
	readonly geom: RawBuilder<unknown>;
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
			organizationId: input.organizationId,
			regionIds,
		}),
	];
}
