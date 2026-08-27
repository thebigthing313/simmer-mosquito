# The region membership predicate, per geometry dimension

Status: Built by
[#269](https://github.com/thebigthing313/simmer-mosquito/pull/269) and accepted
as [ADR 0015](../adr/0015-region-membership-is-computed-interior-intersection.md).
Current.

> The predicate below shipped as written. `packages/db/src/domains/map-region-filter.ts`
> carries the same `&&` for the GiST index, the same
> `st_relate(region, record, 'T********')` for a polygon record and the same
> `st_intersects` for every other dimension, and serves both the Region
> multiselect and `GET /records/:recordType/:recordId/regions`. The two claims
> this doc hands to #244 for a live database were settled there; the answers are
> in `packages/db/src/tests/integration/domains/region-membership.integration.test.ts`
> and `apps/server/src/tests/integration/region-membership.integration.test.ts`.
> `docs/region-membership-spec.md` is the built shape. This is the reasoning
> behind its predicate.

Research for issue #243, part of the map in #242. Nothing here is built. No
database was queried: every claim below is either read off the PostGIS 3.5
manual or read off this repo's migrations and domain validators, and the two
claims that need a live database are named as such and handed to #244.

## The answer

One predicate, one branch, keyed on the record row's geometry type.

```sql
exists (
  select 1
  from regions rf
  where rf.organization_id = :organization_id
    and rf.deleted_at is null
    and rf.id is distinct from :record_id          -- only when the record is a region
    and rf.geom && :record_geom
    and case
          when :record_geom_type = 'st_polygon'
            then st_relate(rf.geom, :record_geom, 'T********')
          else st_intersects(rf.geom, :record_geom)
        end
)
```

`regions.geom` is always `geometry(Polygon, 4326)`, so the region side of the
pair never varies. The only thing that varies is the record, and it varies over
exactly three types.

- Record is a point: `st_intersects`. A point on the boundary is in.
- Record is a line: `st_intersects`. A line lying along the boundary is in.
- Record is a polygon: `&&` plus `st_relate(a, b, 'T********')`. Two polygons
  that share only a border are out.

`'T********'` is nine characters: one `T` and eight `*`. The DE-9IM matrix is
read left to right, top to bottom, so cell 1 is `dim(I(a) ∩ I(b))`, the
interiors ([PostGIS 3.5 manual, Dimensionally Extended 9-Intersection
Model](https://postgis.net/docs/manual-3.5/using_postgis_query.html)). `T` means
"intersection dimension is non-empty; i.e. is in `{0,1,2}`" and `*` means "don't
care", from the same section. So the pattern reads: the interiors touch,
anything else is fine. That is the settled rule stated as a matrix cell.

The branch key is the stored `geom_type` column
(`lower(st_geometrytype(geom))`, so `'st_point'`, `'st_linestring'`,
`'st_polygon'`), maintained by trigger since `202607070001_sync_owned_centroid_columns.sql`.
`st_dimension(geom) = 2` picks out the same rows for every value this schema
admits, and the TypeScript half will branch on the GeoJSON `type` string, which
is the same three-way split again. Use the column: it is already on the row, it
costs no function call, and it names the type instead of a number.

## Is `ST_Relate` the right area-vs-area test

Yes, and no single named predicate replaces it.

`ST_Overlaps` is defined as
`dim(A) = dim(B) = dim(Int(A) ⋂ Int(B)) ∧ (A ⋂ B ≠ A) ∧ (A ⋂ B ≠ B)`
([ST_Overlaps](https://postgis.net/docs/ST_Overlaps.html)). The two trailing
clauses are the miss: a habitat polygon drawn wholly inside a district is not an
overlap, and `ST_Overlaps` returns false for it. That is the most common case
this feature exists to answer.

`ST_Contains` is
`(A ⋂ B = B) ∧ (Int(A) ⋂ Int(B) ≠ ∅)`
([ST_Contains](https://postgis.net/docs/ST_Contains.html)), and `ST_Within` is
its converse, stated on the same page: `ST_Contains(A,B) = ST_Within(B,A)`.
Either one alone misses the polygon that straddles a boundary, which is a real
record: a treatment area that runs across two districts belongs to both.

So the named predicates split the answer four ways. For two polygons with
non-empty interior intersection, either the record is inside the region
(`ST_Within` or `ST_Equals`), or the region is inside the record
(`ST_Contains`), or neither covers the other, in which case both are
two-dimensional and the interior intersection of two open sets is itself
two-dimensional, so `ST_Overlaps` holds. `ST_Relate(a, b, 'T********')` is that
four-way union written once, and it is the union that has a name in the manual
rather than in a comment.

There is one exact equivalent worth knowing, because the TypeScript half may
find it easier to reproduce: `ST_Intersects(a, b) AND NOT ST_Touches(a, b)`.
`ST_Touches` matches `FT*******`, `F**T*****`, `F***T****`
([ST_Touches](https://postgis.net/docs/ST_Touches.html)), which is every way two
geometries can meet with cell 1 empty. Intersecting with cell 1 empty is exactly
touching, so intersecting and not touching is exactly cell 1 non-empty. It costs
two GEOS calls instead of one and it reads as a double negative, so `ST_Relate`
is the better SQL. It is the better cross-check for the shared corpus in
decision 8 of the map.

`ST_Covers` is the wrong direction: it is the more inclusive relationship that
does count boundary-only containment, which is what the settled rule excludes.

## Multipart records and geometry collections

The ticket's worry does not arise, because neither a multipart geometry nor a
collection can reach a `geom` column on any of the 15 tables. Two independent
gates hold it.

The database gate. `202605270001_owned_geometry_columns.sql` gives every
`geometry(Geometry, 4326)` table a check constraint:

```sql
add constraint habitats_geom_type_check
  check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'))
```

Nine tables carry it: `habitats`, `inspections`, `applications`,
`source_reductions`, `outreach_actions`, `biocontrol_actions`,
`requested_control_actions`, `mission_items`, `notification_registrations`. The
other six are typed to a single geometry by their column modifier:
`regions` is `Polygon`, and `addresses`, `traps`, `collections`,
`service_requests`, `weather_sources` are `Point`. `geometrytype` returns the
type string, so a `MULTIPOLYGON` returns `'MULTIPOLYGON'` and fails the check,
and a `GEOMETRYCOLLECTION` returns `'GEOMETRYCOLLECTION'` and fails it
([GeometryType](https://postgis.net/docs/GeometryType.html)). No later migration
drops or replaces any of those constraints; `grep geom_type_check
packages/db/migrations/` hits only that one file.

Note for #242: the map says eight tables are `geometry(Geometry, 4326)`. It is
nine. The count of geom tables, 15, is right.

The domain gate. `packages/domain/src/shared.ts` defines
`SupportedGeometryType = 'Point' | 'LineString' | 'Polygon'` and
`validateGeometry` rejects anything else before a command is built, so the
multipart case cannot be constructed on the write path either. Imported files do
not sneak past it: `packages/mapping/src/geometry-import.ts` flattens multipart
geometries into one candidate per part and recurses into collections, so a
`MultiPolygon` in a KML becomes several single polygons before any of them is
offered as a record's location.

That closes both sub-questions the ticket raises.

- The multipolygon with one overlapping part and one touching part cannot exist
  here. If it ever could, the predicate would still be right: `ST_Relate`
  evaluates the DE-9IM of the whole geometry, so one part with an interior
  intersection makes cell 1 non-empty and the record is in. Included when any
  part genuinely overlaps is the behaviour you want.
- The mixed `GEOMETRYCOLLECTION` silently dropping its point cannot exist here
  either. The reasoning behind the worry is sound: `ST_Dimension` returns "the
  largest dimension of the components of a `GEOMETRYCOLLECTION`"
  ([ST_Dimension](https://postgis.net/docs/ST_Dimension.html)), so a
  polygon-plus-point collection would take the area branch and the point would
  never be tested. Branching on `geom_type` rather than `ST_Dimension` also
  removes the failure mode by construction, because `'st_geometrycollection'`
  is not `'st_polygon'` and would fall to the intersects branch. That is a
  second reason to prefer the column, but the constraint is the reason the case
  is closed.

If a future table ever relaxes the type check, this predicate needs revisiting
before that migration ships. Worth an explicit line in the ADR.

## A line along the region boundary

Included, which is what the settled rule wants.

`ST_Intersects` returns true if "two geometries intersect. Geometries intersect
if they have any point in common"
([ST_Intersects](https://postgis.net/docs/ST_Intersects.html)). A line lying on
the boundary shares every one of its points with the region, so it intersects.
The line branch is plain `ST_Intersects`, so it is in.

It is worth seeing why it would be out under the area rule, because that is the
whole reason the branch exists. For a line on a polygon's boundary, the line's
interior meets the polygon's boundary, not the polygon's interior, so cell 1 is
`F` and `'T********'` fails. A line has no area to overlap with, so demanding an
interior intersection would demand it leave the boundary. Same for a point on
the boundary: cell 1 is `F`, `ST_Relate` says no, `ST_Intersects` says yes, and
yes is the answer the domain wants. Decision 1 in #242 is not a convenience, it
is forced.

One GEOS edge case to record: from PostGIS 3.5 with GEOS 3.12+, RelateNG treats
zero-length LineStrings as the equivalent Point ([PostGIS 3.5.0 release
announcement](https://postgis.net/2024/09/PostGIS-3.5.0/)). A degenerate
two-position line with identical coordinates would relate as a point. Our
domain validator allows it (`validateLineStringCoordinates` checks the count,
not the extent), but it cannot cause a disagreement, because both the point and
the line branch call `ST_Intersects`. Flag it for the TypeScript half, which
must make the same choice.

## The index question

Answered from the manual, because the capability question does not need a plan.

`&&` "Returns TRUE if A's 2D bounding box intersects B's 2D bounding box" and
"This operand will make use of any indexes that may be available on the
geometries" ([&&](https://postgis.net/docs/geometry_overlaps.html)).

`ST_Relate` does not do that for you. The manual is explicit: "Unlike most of
the named spatial relationship predicates, this does NOT automatically include
an index call" ([ST_Relate](https://postgis.net/docs/manual-3.5/ST_Relate.html)).
The reason given is that some DE-9IM relationships hold for geometries that do
not intersect at all, `Disjoint` being the obvious one, so PostGIS cannot inject
a bounding-box filter without changing the answer. The page says to add the `&&`
operator yourself.

So: `ST_Relate` does not block the index scan, it contributes nothing to it.
Writing `rf.geom && :record_geom AND st_relate(...)` leaves the bounding-box
half of the predicate index-aware exactly as it is today. Without the `&&`,
every live region in the agency gets a full GEOS relate. The `&&` must be
written, and once written it is sufficient. `ST_Intersects`, on the other hand,
"automatically includes a bounding box comparison that makes use of any spatial
indexes"
([ST_Intersects](https://postgis.net/docs/ST_Intersects.html)), so on the
point and line branch the explicit `&&` is redundant. Keep it anyway: it is the
same clause on both branches, it costs a bounding-box comparison, and it stops
the two branches from drifting.

Two things gate the index in this particular query and neither is about
`ST_Relate`.

1. `regions_geom_gist_idx` is `where deleted_at is null`. A partial index is
   only usable when the query carries a matching predicate, so the
   `rf.deleted_at is null` clause is load-bearing for the index, not only for
   correctness. The shipped `regionMembershipClause` already has it.
2. Whether the planner picks the index is a cost decision over a table with one
   agency's regions in it. A sequential scan over a few dozen rows is the
   cheaper plan and choosing it is not a bug.

I did not run `EXPLAIN`, and a plan is the one thing here a document cannot
settle. Point 2 is what #244 should measure: not "does the index get used" but
"how long does the whole read take against real region counts", with `EXPLAIN
(ANALYZE, BUFFERS)` on the largest agency. The capability question is closed by
the manual.

One more performance note, for #244 rather than for the predicate. PostGIS
caches prepared geometry for repeated calls of some predicates against the same
argument, and PostGIS 3.5 with GEOS 3.13 extended that set to touches, crosses,
disjoint and overlaps ([PostGIS 3.5.0 release
announcement](https://postgis.net/2024/09/PostGIS-3.5.0/)). `ST_Relate` is not
in that set. This read holds one record geometry constant against a handful of
regions, which is the shape prepared geometry helps most, so if the area branch
ever measures slow, `ST_Intersects AND NOT ST_Touches` is a form of the same
predicate that can use the cache. Measure before switching. Do not switch for
the theory.

## Empty geometries

The schema does not bar them. The domain does.

`geom` is `not null` on all 15 tables, but null and empty are different things.
`POLYGON EMPTY` is a polygon, so `geometrytype` returns `'POLYGON'` and it
passes the `geom_type_check` constraint, and it matches the `geometry(Polygon,
4326)` column modifier too. So neither gate in the migration excludes an empty
geometry. The generated `lat`/`lng` columns would come out null for one, and
nothing declares them `not null`.

The write path does exclude them. `validateGeometry` in
`packages/domain/src/shared.ts`:

- a Point needs a position of two or three finite numbers in range,
- a LineString needs "at least two positions",
- a Polygon needs at least one ring, each ring at least four positions, first
  equal to last.

There is no way to build a command carrying an empty geometry, and commands are
the only write path.

Behaviour if one existed anyway, from a seed or a manual insert: the record
would match no region and no query would error. An empty geometry has no points,
so it has nothing in common with anything and `ST_Intersects` is false; its
interior is empty, so cell 1 is `F` and `'T********'` is false. "No regions" is
the honest answer for a record with no location, so the predicate degrades
correctly rather than lying.

What I cannot answer without a database is whether any empty row is already
sitting in staging or production. `select count(*) from <table> where
st_isempty(geom)` across the 15 tables is a one-liner for #244, and this repo has
been bitten before by treating migration text as proof of the live schema. Run
it there.

## What this leaves for the rest of the map

- The predicate excludes a region from its own result with `rf.id is distinct
  from :record_id`, not with geometry. Two regions with identical boundaries are
  a real possibility and `ST_Relate` would match them, correctly. Decision 4 of
  #242 is an id filter and belongs in the helper, guarded by record type.
- The shipped `regionMembershipClause` in
  `packages/db/src/domains/map-region-filter.ts` is the same query with
  `st_intersects` on every branch. Moving it onto this predicate is decision 7
  of #242 and it is a behaviour change with one visible effect: a polygon record
  that only shares a border with the selected district drops out of the filtered
  list. Say that in the changeset.
- The shared corpus, decision 8, needs at least these pairs, and each has a
  known answer from the reasoning above: point inside, point on boundary, point
  outside, line crossing, line wholly inside, line along the boundary, line
  touching at one endpoint, polygon inside, polygon containing the region,
  polygon straddling the boundary, polygon sharing one edge and nothing else,
  polygon sharing one corner vertex, polygon identical to the region. The last
  three are the ones the two implementations will disagree on if either gets the
  branch wrong.

## Sources

Every claim above traces to one of these.

- [ST_Relate](https://postgis.net/docs/manual-3.5/ST_Relate.html), PostGIS 3.5 manual
- [ST_Intersects](https://postgis.net/docs/ST_Intersects.html)
- [ST_Touches](https://postgis.net/docs/ST_Touches.html)
- [ST_Overlaps](https://postgis.net/docs/ST_Overlaps.html)
- [ST_Contains](https://postgis.net/docs/ST_Contains.html)
- [ST_Dimension](https://postgis.net/docs/ST_Dimension.html)
- [GeometryType](https://postgis.net/docs/GeometryType.html)
- [ST_IsEmpty](https://postgis.net/docs/ST_IsEmpty.html)
- [The && operator](https://postgis.net/docs/geometry_overlaps.html)
- [Dimensionally Extended 9-Intersection Model](https://postgis.net/docs/manual-3.5/using_postgis_query.html), PostGIS 3.5 manual, chapter 5
- [PostGIS 3.5.0 release announcement](https://postgis.net/2024/09/PostGIS-3.5.0/), for RelateNG and prepared-geometry caching
- `packages/db/migrations/202605270001_owned_geometry_columns.sql`
- `packages/db/migrations/202607070001_sync_owned_centroid_columns.sql`
- `packages/db/src/domains/map-region-filter.ts`
- `packages/domain/src/shared.ts`
- `packages/mapping/src/geometry-import.ts`

The deployed PostGIS is `postgis/postgis:17-3.5`, named in `CLAUDE.md` as the
version CI's integration job runs and the version staging runs, which is why the
3.5 manual is the one cited.
