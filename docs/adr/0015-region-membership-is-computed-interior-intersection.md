# 15. Region membership is computed, and areas need interiors to meet

Date: 2026-08-24

## Status

Accepted. Amends the plain-intersection rule the Region multiselect shipped
under, documented in `packages/db/src/domains/map-region-filter.ts`. Amended for
multipart geometry by ADR 0018, and by #1671 for an overlap threshold and
valid Regions; see the two amendments below.

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
- Membership does not require a valid geometry and nothing checks for one.
  Fifteen of production's 345 Regions hold a self-intersecting ring. #417 settled
  that such a ring stores rather than being refused on its next save, and GEOS
  leaves the result of a relate on one undefined without raising. Measured
  against the production clone, repairing those fifteen with `ST_MakeValid`
  changed no answer on 9,181 region-against-record candidate pairs or on 103
  region-against-region ones, which is why #437 left the rows alone. That is a
  fact about where the data sits rather than a property of the predicate: a
  record sharing an edge with an invalid ring is answered inside, where the
  repaired region answers outside. The second `describeDbIntegration` block in
  `packages/db/src/tests/integration/domains/region-membership.integration.test.ts`
  seeds that pair and pins both answers, so the next person reads the measurement
  instead of taking it again. Validity is unpoliced. The neighbouring rule, that
  a stored geometry must cover ground, is #434's and is enforced. The 2026-10-13
  amendment below supersedes this bullet for Regions, which are now held valid;
  for record areas it stands.
- The empty answer is a real answer. A trap in no spray zone is an operational
  fact, not a gap.

## Amendment, 2026-09-03: multipart geometry

Amended by ADR 0018, which lets a record hold MultiPoint, MultiLineString or
MultiPolygon geometry on the same row and id as its single-part form.

The rule does not change. It widens, because the interior rule was already
written in the one vocabulary that covers both shapes. The OGC model defines the
interior of a MultiPolygon as its point set with the rings of its element
Polygons removed, which is the union of its parts' interiors, one connected
component per part. `'T********'` reads the interior-interior cell, so the
question the predicate asks a multipart record is "does any part's interior meet
the region's interior".

That gives the answers the domain wants without a new rule. A treated area split
into two lobes by a road, one lobe inside a district, is in that district. A
parcel set whose every lot abuts a district edge and overlaps it nowhere is next
to the district, not in it, exactly as a single Polygon in the same position
already was.

Three things follow.

**The branch reads areal rather than polygon.** The record takes the interior arm
when its `geom_type` is `st_polygon` or `st_multipolygon`, and plain intersection
otherwise. The stored `geom_type` column is still what decides, so it still
cannot drift from the geometry it describes.

**A MultiPolygon region behaves the same way.** The interior-interior cell is
symmetric, so once `regions.geom` accepts a MultiPolygon, a record is in a
multipart region when it meets any part's interior. No predicate change. The `&&`
prefilter gets looser, because a multipart bounding box covers the gaps between
the parts, and that costs candidates rather than correctness.

**MultiPoint and MultiLineString stay on plain intersection**, for the reason the
single-part forms do: boundary contact is the only contact those shapes can offer
a region, and excluding it would put a trap standing on a district line in no
district. A MultiLineString has a second reason. Its boundary is the mod-2 union
of its parts' endpoints, not the plain union, so an interior-only rule would
answer differently for one LineString than for the MultiLineString built from its
halves. Plain intersection reads no boundary cell in isolation and sidesteps
that.

The paragraph above that said multipart and collection geometry cannot occur is
superseded. Two of its three claims still hold and are worth keeping: the
`geom_type` column is maintained from the geometry it describes, and
GeometryCollection remains out of scope, so the areal set stays closed at two
names.

One thing this amendment assumes and does not provide: that stored MultiPolygons
are valid. PostGIS allows parts that touch at a finite number of points and
forbids parts that share an edge or overlap, and it warns that its functions
assume valid input. `ST_Relate` has no repair step, so an invalid row can abort a
tile read or answer wrongly. ADR 0018 leaves validity unpoliced, because 15 of
345 production Regions already fail `ST_IsValid` and a gate would refuse them on
their next save. #437 measured what those 15 answer and left them where they are.
The Consequences bullet above on validity carries the numbers and names the
guard. The 2026-10-13 amendment below lifts the assumption for Regions, which are
now repaired on write and held by a CHECK, and not for record areas.

### Consequences of the amendment

- Saved district filters can change answer again, this time only for rows that
  are multipart, of which there are none on the day it lands. ADR 0018 does no
  backfill, so the change is forward-looking by construction.
- The corpus grows from 22 cases to 32 to cover the multipart arms before mobile
  implements them. The gate rises ahead of the implementation, which is
  deliberate.

## Amendment, 2026-10-13: an overlap threshold, and valid Regions

Amended by #1671.

### The threshold

Area against area now needs more than meeting interiors. Two areas are members
of each other only when their intersection covers at least 0.1% of the smaller
of the two. That applies to every area-versus-area answer the shared predicate
gives, a Region against a Region and a record area against a Region alike.
Point and line records are unchanged, and a border shared exactly still does not
count, because its intersection has no area.

The interior rule could not tell a digitizing sliver from real overlap. Two
municipal boundaries drawn from different sources overlap along their shared
edge by a few square metres, and under `'T********'` that made neighbouring
municipalities members of each other. Measured on the production clone of
2026-08-24, Plainsboro and its sections against every region whose interior they
meet:

| Kind | Pairs | Overlap | Share of the smaller area |
| --- | --- | --- | --- |
| Digitizing slivers (South Brunswick and its sections, Cranbury - Section 1, Cranbury) | 16 | 0 to 3,239 m² | at most 0.034% |
| Real overlaps (5-13, 5-18, 5-20A, 5-5, 5-63, 5-14, Audubon's Plainsboro Preserve) | 13 | 34,028 m² and up | at least 0.48% |

0.1% sits between the two groups, with a factor of three to the slivers and five
to the smallest real overlap. A ratio rather than a fixed area, because a fixed
area that excludes a municipal sliver also excludes a whole small habitat.

The predicate checks the interior cell first and measures only the pairs that
pass it, so a boundary-only or disjoint pair never pays for an overlay. The
areas are planar, in square degrees. For a ratio between two shapes in the same
place the unit cancels to well under the gap between 0.034% and 0.48%.

On the clone, the six Plainsboro neighbours that were slivers drop out and the
nine real overlaps stay. Across every ordered pair of Regions, 2,066 memberships
become 1,342. Record areas move less, because few are drawn along a boundary: of the
71 Application-against-Region pairs whose interiors meet, 63 remain.

### Valid Regions, and only Regions

Measuring overlap needs `ST_Intersection`, and `ST_Intersection` throws a
TopologyException on a ring that crosses itself. The paragraph above that called
validity unpoliced, and #437's measurement that repair changed no answer, both
held only while the predicate stopped at `ST_Relate`. Three of the Regions
Plainsboro overlaps were invalid, so the read threw rather than answering.

So the Region side is held valid. The server stores Region geometry through
`valid_region_geom`, which runs `ST_MakeValid` on an invalid ring and keeps the
polygonal part, demoting a one-part MultiPolygon. A migration repaired the
fifteen live Regions already stored, and `regions_geom_valid_check` refuses an
invalid one. The default MakeValid method is the one used, because the compose
image runs GEOS 3.9 and ignores `method=structure`.

Three of the fifteen came back from `ST_MakeValid` as a GeometryCollection
carrying stray lines, and keeping the polygonal part made each a MultiPolygon.
The repair moved no outline. The area of every row but one moved by a few square
metres. `5-21: Millstone River - East` went from 112,765 m² to 414,171 m²: its
ring was a bow-tie whose lobes are 263,468 m² and 150,703 m², and the shoelace
formula counted the reversed lobe as negative, so the stored figure was their
difference.

Record areas are not repaired and get no CHECK. The draw control's Split gesture
writes two pieces that share the line they were cut along (#497), which OGC calls
invalid and which #518 kept on purpose; `ST_MakeValid` would dissolve the two
pieces back into one. The predicate instead reads a record area through
`ST_MakeValid`, polygonal part only, where `ST_IsValid` is false, so an invalid
record cannot make a membership read throw. Valid records, which are nearly all
of them, pay one `ST_IsValid` call and nothing else.

This supersedes the validity Consequences bullet above for Regions, and the line
in ADR 0018 that left validity unpoliced. For record areas that line still holds.

### Consequences of the amendment

- District filters and the regions panel can change answer for any area record
  or Region whose overlap with a district is a sliver. That is a fix, filed as
  `Fixed:`, because the sliver memberships were never the rule anyone wanted.
- The corpus grows from 34 cases to 36, a sliver under the line and a small real
  overlap over it, and both halves carry the threshold: `AREA_OVERLAP_SHARE` in
  the corpus and `REGION_AREA_OVERLAP_SHARE` in `packages/db`, held equal by the
  integration suite. Mobile's predicate inherits the measurement.
- A Region write that `ST_MakeValid` reduces to nothing polygonal is refused
  with an error rather than stored empty.
