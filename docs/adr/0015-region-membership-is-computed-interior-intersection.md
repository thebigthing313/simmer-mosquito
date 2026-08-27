# 15. Region membership is computed, and areas need interiors to meet

Date: 2026-08-24

## Status

Accepted. Amends the plain-intersection rule the Region multiselect shipped
under, documented in `packages/db/src/domains/map-region-filter.ts`.

## Context

A Region is an agency-drawn polygon. Membership is spatial, never a foreign key,
so it stays correct when a boundary is redrawn. Nothing stores which regions a
record falls inside.

The shipped Region multiselect on the map pages already asks a version of this
question, filtering with `st_intersects` and counting a boundary touch as
inside. That was a deliberate call, written into the helper's doc comment: a
habitat line crossing a district boundary is work in that district, so the
filter is intersection rather than containment.

Answering the inverse on a detail page, "which regions contain this record",
forced the boundary case to be settled properly. Under plain intersection, a
polygon that shares only an edge with a district and overlaps it nowhere counts
as inside it. That is not work partly in the district, it is work next to it,
and reading it as membership is the confusion this effort started from.

Two more facts shaped the decision. Fifteen tables carry `geom`, and nine of
them are `geometry(Geometry, 4326)`, so the geometry dimension is a per-row fact
rather than a per-table one. And `apps/mobile` has to answer this question with
no server, so whatever rule is chosen has to be expressible twice.

## Decision

**One membership rule, branching on the record's geometry dimension.** A record
is inside a region when:

- the record is a point or a line, and it shares any point with the region
  (`st_intersects`);
- the record is a polygon, and their interiors intersect
  (`st_relate(region, record, 'T********')`, with an explicit `&&` for the
  index).

Boundary-only contact is excluded for area versus area, and only there. A point
on a boundary and a line running along a boundary stay inside, because boundary
contact is the only contact they can have. Excluding it for them would mean a
trap on a district line belongs to no district, which is wrong and is not what
the area rule is trying to say.

`'T********'` is the DE-9IM cell for "the interiors intersect" and nothing else.
It is the four-way union of Within, Contains, Equals and Overlaps written once,
which is why no named PostGIS predicate replaces it: `ST_Overlaps` drops the
polygon drawn wholly inside a district, `ST_Contains` and `ST_Within` drop the
polygon straddling a boundary, and `ST_Covers` counts the boundary-only case
this rule exists to exclude.

The branch reads the stored `geom_type` column, a generated stored column of
`lower(st_geometrytype(geom))`, so it cannot drift from the geometry it
describes. Multipart and collection geometry cannot occur, on two independent
gates: nine tables carry
`check (geometrytype(geom) in ('POINT','LINESTRING','POLYGON'))` and the other
six are typed by their column modifier, and `packages/mapping` flattens
multipart input before a candidate is offered. If a table ever relaxes that
check, this rule needs revisiting before that migration lands.

**Membership is computed on read and never stored.** Measured on production
rather than assumed: an ordinary detail page costs microseconds, and the one
area-versus-area read costs tens of milliseconds at worst. Cost tracks
bounding-box candidates times their vertex count rather than library size, so a
bigger region library does not change that. The numbers and the caveats on them
are in the spec.

A cache would be a second copy of an answer the database gives in microseconds,
invalidated by every region edit and every geometry write, and it would go stale
silently, which is the failure this system keeps producing. If the cost ever
stops being negligible, `ST_Subdivide` on a materialized region-parts table is
the escape hatch. It is not built.

**The rule gets two implementations, held together by one corpus.** SQL answers
for web, because web is online-only. A TypeScript implementation in
`packages/mapping` answers for mobile, because a device has no server. Neither
is the source of truth; a hand-written corpus of geometry pairs in
`packages/mapping` is, and both halves are held to it. The expected answers are
written and reviewed by hand, never generated from PostGIS, because a corpus
PostGIS wrote can only confirm that PostGIS agrees with itself.

**The Region multiselect moves onto the same predicate.** Two surfaces answering
the same question differently about the same record, on a page the user is
already looking at, is worse than either answer alone, and nobody finds out
until a count in a report is wrong.

## Consequences

- Saved district filters can return different records. Six of the nine tables
  the multiselect filters can change answer; the three point-typed ones cannot
  be reached by the rule change. That is a change and not a fix, because the old
  answers were defensible under the rule this amends.
- The predicate is for a standalone read of one record. The planner
  underestimates its selectivity badly enough to pick the wrong strategy if it
  were composed into a larger join.
- The two implementations can disagree in the field. A corpus is a fixed set of
  cases and agency-drawn polygons are not that set, so the server is the
  reconciler and a reported disagreement is a corpus bug first.
- GEOS is not reachable on the client, so the TypeScript half is hand-rolled
  rather than shared with the code PostGIS runs.
- The empty answer is a real answer. A trap in no spray zone is an operational
  fact, not a gap.
