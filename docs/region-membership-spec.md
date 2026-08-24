# Region membership

Which regions contain a record, and how the answer is produced, read and
rendered. The rule itself and why it was chosen are ADR 0015; this is what gets
built.

Nothing here is built yet. The one shipped piece is the Region multiselect on
the map pages, which answers the inverse question under the old rule and is
migrated by this spec.

## The predicate

A record is inside a region when their geometries meet, with area versus area
requiring their interiors to meet. Points and lines take plain intersection;
polygons take interior intersection. ADR 0015 has the reasoning.

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

`regions.geom` is `geometry(Polygon, 4326)`, so only the record side varies, and
only over three types.

Four things about this expression are load-bearing.

The explicit `&&` is what reaches the index. `ST_Relate` does not include an
index call, because relationships like Disjoint hold for geometries that do not
intersect, so without `&&` every live region gets a full GEOS relate. Confirmed
on production: the plan shows `Index Scan using regions_geom_gist_idx` with
`Index Cond: (rf.geom && ...)` and `st_relate` in the filter.

`rf.deleted_at is null` is also load-bearing for the index, not only for
correctness. `regions_geom_gist_idx` is partial on `where deleted_at is null`.

Excluding a region from its own result is an id filter, not a geometry one. Two
regions can have identical boundaries and `ST_Relate` would match them,
correctly.

The branch reads `geom_type`, a generated stored column, rather than calling
`ST_GeometryType`. It cannot drift, and reading it is free.

`ST_Intersects AND NOT ST_Touches` is exactly equivalent to the polygon branch
and costs two GEOS calls. Keep it as the corpus cross-check, not as the shipped
expression.

### The helper

`regionMembershipClause` in `packages/db/src/domains/map-region-filter.ts` gains
a **required** third argument, `geomType`, and branches internally. Required
rather than optional with a fallback: TypeScript then forces every call site to
supply it, and a new call site cannot get the wrong branch by omission.

Its doc comment keeps the crossing-line example and loses the "intersection, not
containment" framing, which becomes half-wrong once area versus area excludes
boundary contact. The replacement states the rule in three parts and points at
ADR 0015 rather than restating the reasoning in a second place.

### Where it is not for

This predicate is for a standalone read of one record. The planner estimates one
row and gets 38, which is harmless for a primary-key lookup driving a nested
loop and would pick the wrong strategy inside a larger join.

## The read

`GET /records/:recordType/:recordId/regions`, in `apps/server`.

It is a sibling of `/records/:recordType/:recordId/delete-impact` in
`apps/server/src/record-deletion.ts`, which already solves this shape: generic,
keyed by record type and id, whitelisted, agency-scoped, and answering
`found: false` rather than 404 so the endpoint cannot be used to probe for
another agency's ids. Build the two to read as a pair.

Not on `/map/*`. Every `/map/*` route today is a tileset or one record's
boundary, and this returns names with no geometry. Both prefixes get identical
treatment in `cache-headers.ts` (`PRIVATE_READ_PREFIXES`), `cors-options.ts` and
`response-compression.ts`, so the choice is about meaning, not plumbing.

### The whitelist

`REGION_MEMBERSHIP_RECORD_TYPES` in `packages/db`, with an
`isRegionMembershipRecordType` guard mirroring `isDeletableRecordType`. Fifteen
members, one per geom-bearing table:

`addresses`, `regions`, `traps`, `collections`, `habitats`, `inspections`,
`applications`, `source_reductions`, `outreach_actions`, `biocontrol_actions`,
`requested_control_actions`, `mission_items`, `service_requests`,
`notification_registrations`, `weather_sources`.

`DeletableRecordType` is not reusable. It is 32 members and wrong in both
directions: it includes `sample`, `route`, `assignment`, `contact`, `mission`
and every catalog, none of which carry `geom`, and it misses mission items,
notification registrations and weather sources, which do.

A coverage test asserts the list is exactly the set of tables carrying a `geom`
column, read from the generated row schemas rather than a hand-kept copy.
`writer-coverage.test.ts` is the precedent for asserting over every table at
once. Without it the sixteenth geom table answers "inside no regions" forever,
and nobody notices, because it looks like data.

### Tenancy

The record is looked up with the caller's `organization_id` before it is read at
all, and the region set scopes to the record's own `organization_id` column the
way `regionMembershipClause` already does, so a region id from another agency
cannot widen the answer.

All 15 tables carry `organization_id`, `deleted_at`, `geom_type` and `geom`
directly, read off production's `information_schema`. None derive tenancy
through a foreign key, so the gate is one shape.

**One exception.** `weather_sources` is the only one of the 15 whose
`organization_id` is nullable, and the null rows are the shared provider
stations `gis/weather/$id.tsx` already branches on with `isOwned`. Its record
gate is `organization_id = :caller or organization_id is null`.

That does not weaken the probe defence: a null-org row is owned by nobody, not
by another agency, and is already visible to every agency by design. The region
side is untouched, because `regions.organization_id` is NOT NULL, so a null-org
record is answered with the caller's own regions. Operationally that is the
point, since an agency subscribes to a provider station to find out which of
their districts it sits in.

The coverage test gains a case for it: a `weather_sources` row with a null
`organization_id` answers `found: true` for an agency unrelated to it. The other
fourteen tables can never expose this, so without the case the narrow gate reads
correct and regresses silently.

### Response

```
{ found: boolean, groups: [{ folderId, folderName, regions: [{ id, name }] }] }
```

Folders ordered by name with the unfiled group last, regions ordered by name
inside each. `folderId` and `folderName` are null together for the unfiled
group; shipping the id means the panel keys on it rather than on a name that is
not unique.

No counts, because the panel renders none and a field the UI does not read
drifts. No geometry, which is what keeps this off `/map/*`. No paging: the worst
real record matches 38 regions out of a 345-region library.

`geom` is NOT NULL on all 15 tables, so "a record with no geometry" is not a
case the contract carries.

### Errors and absence

A record type not on the whitelist is 404 `unknown_record_type`. The type list
is not secret.

A record id that is unknown, cross-agency, or soft-deleted all answer
`found: false`, and they have to be indistinguishable. That is why `found` is a
body field and not a status code.

Soft deletes cut on both sides: live regions only, matching the shipped
`regionMembershipClause`, and a soft-deleted record answers `found: false`,
matching `readDeleteImpact`. The region side matters more than it looks, because
the multiselect and this read share one predicate, and a different region filter
here would mean the same predicate answering two different questions depending
on the caller.

### Authorization

`authContextMiddleware` and nothing else. No role floor, matching
`delete-impact` and `/map/service-requests/:id/nearby`. Region and folder names
already reach every member through sync, so a floor here would gate a fact the
client can already assemble. If regions ever become role-restricted, that is a
change to the shape scope and this endpoint inherits it.

## The client read

Mirror `use-delete-impact`. Query key `['record-regions', recordType, recordId]`,
`staleTime: 15_000`, `refetchOnWindowFocus: true`.

Two invalidations. A record's own geometry write invalidates its one key. A
region write from the GIS region pages invalidates the whole `['record-regions']`
prefix. Region edits happen in one place, so the page causing the staleness is
the page that clears it, precisely and for one client. Chasing the other clients
is what a cache would be for, and ADR 0015 ruled that out.

Do not subscribe the region library to derive a cache version. `regions` is
on-demand, so that pulls the whole library onto every detail page, and on-demand
collections carry a known suspense hang.

## The panel

A full-width inset band directly under the record's map card, full width of the
main column (the 22rem rail is a sibling, not a parent). The answer is spatial,
so it sits under the shape it came from.

It renders a "Regions" heading, then one row per region folder: the folder name,
then the matching regions as chips, each linking to `/gis/regions/$id`. Only
folders with a hit appear, plus a "No folder" row when unfiled regions match.

No total count. The rows are the answer, and a tally above them is a second
thing to read that says less.

The band scrolls internally past roughly five folders rather than growing
without limit. Measured on the prototype at ten folders and thirteen regions:
208px visible against 352px of content, with the rest of the page holding
position.

A folder row shows at most six chips, then `and N more` as an inline text
button; expanded it shows every chip and offers `Show fewer`. Six is roughly one
line at the band's width. On production every folder holds exactly one region
for a point record, so the expander only ever fires on the region detail page,
which is where one municipality overlaps 38 sections.

Empty state, taking the record's noun: "This habitat is inside none of your
regions", "This weather station is inside none of your regions". For a trap in
no spray zone the absence is the operational answer, not a gap to apologise for.

On `found: false` the band renders nothing. No band, no message, no error. If
the record is gone, the page around the band is already showing something it
should not, and a band announcing "not found" underneath a rendered record
contradicts the page it sits in. That is a race, and the page's own error
handling owns it. `found: false` and "found, inside no regions" are different
states, and the empty copy belongs only to the second.

Prototype on branch `prototype/regions-panel`, with the winning variant carrying
a `WINNER (ticket #245)` comment. Two variants were tried and rejected: a card
in the sticky rail, which puts a spatial answer a column away from the map, and
rows inside the existing Details card, which reads well at one folder and pushes
Created and Updated most of a screen down at ten.

## Surfaces

**The endpoint answers for 15 tables. 13 surfaces ask.** Both numbers matter,
and the drift is in reading "all 15 geom tables" as a promise of 15 panels.

Twelve detail pages already render `RecordLocationCard` in the main column and
take the band directly under it: `addresses`, `applications`,
`biocontrol_actions`, `collections`, `habitats` (via `-habitat-detail.tsx`),
`inspections`, `outreach_actions`, `regions`, `requested_control_actions`,
`source_reductions`, `traps`, and `weather_sources` once it gains a card.

`weather_sources` gains a `RecordLocationCard` on the same branch as the band.
Its `geom` is `geometry(Point, 4326)` NOT NULL, and point tables never touch the
display endpoint: `use-weather-station.ts` already exposes `latitude`,
`longitude` and `geometryKind`, so the card is three props against data already
on the client. No server half, no new endpoint, no sync change. Layout: map card
at the top of the main column, band under it, `WeatherSummariesCard` below both.
Its rail is 18rem against 22rem elsewhere, so a map in the rail would render
narrower than on any other page for no reason.

`service_requests` is a `MapSplitPage`. The map pane is full height, so nothing
sits under it, and the band becomes the first item in the scrolling side panel,
above `RequestDetailsCard`. Not next to `NearbyPanel`, which would read as a
subsection of nearby-context: regions are a fixed boundary the record falls
inside, nearby is a live proximity query.

`mission_items` and `notification_registrations` have no detail page and are out
of the feature. The endpoint still answers for them, because the whitelist is
held to the geom tables by test.

## The corpus

A hand-written `.ts` module in `packages/mapping`, behind a `./test-corpus`
subpath export, read by both halves of the predicate. `packages/db` takes it as
a devDependency plus a tsconfig `references` entry;
`scripts/check-build-graph.mjs` counts `devDependencies`, so that import is
legal.

Its own subpath because `packages/db` sets the precedent with `./test-support`,
and a fixture set appearing in autocomplete next to `centroidFromGeoJson`
invites someone to use it in product code. A `.ts` module rather than JSON
because each case carries a sentence saying why its answer is what it is, and a
corpus whose cases are unexplained is one nobody dares change.

Twenty-two cases, three record dimensions against one shared region **with a
hole**, plus a second region only where a case cannot use the shared one, with
those exceptions named rather than letting cases quietly invent geometry.

- Point: inside; on an edge; on a vertex; outside; inside a hole; on a hole's
  edge.
- Line: crossing the boundary; wholly inside; wholly outside; running along an
  edge and nowhere else; touching at one node; entering and leaving through the
  same edge; crossing a hole.
- Polygon: overlapping; wholly inside; wholly containing the region; sharing one
  edge only; sharing one vertex only; identical; disjoint; sitting entirely in a
  hole; sharing only a hole's edge.

The hole is first-class, not a variant. `ImportPolygonGeometry` is documented as
`[outer ring, ...holes]`, so a KML or GeoJSON upload brings one in, and holes are
where the two implementations are most likely to disagree:
`polygonContainsLngLat` already treats a hole's edge as inside and a naive port
would not.

Multipart and collection geometry stay out, with the omission and its reason in
the file header. Testing input the schema forbids invites someone to make it
pass by relaxing the schema.

Every boundary case is built from a coordinate that appears literally in the
region ring. A derived point on an edge is a different double in each
implementation and the corpus becomes a tolerance argument; with shared literals
the boundary cases are exact and **no tolerance is needed at all**. The one case
where this cannot hold is a line crossing an edge, where the crossing point is
derived, and that case answers true under every rule so precision never decides
it. Realistic WGS84 magnitudes are nearly free, since doubles hold about 1e-14
at lng -90.

Each case asserts the boolean **and** the expected branch. A polygon record
wrongly routed through plain `st_intersects` returns the right answer on every
case except "shares one edge only", and one extra field turns that from the
single case catching a misroute into a redundant check.

Expected answers are hand-written and reviewed, never generated, and the header
says so. If PostGIS writes the expectations, the corpus can only confirm PostGIS
agrees with itself, and the TypeScript side inherits whatever PostGIS does at
the edges rather than the rule the team decided.

### How it runs

The SQL half seeds and asserts in a single `it()` with one `withTestDb`, calling
the shipped helper rather than inline SQL. `withTestDb` applies the whole
migration set per call, about 1s against a local container and 9s against a
remote one, so twenty-two `it()` blocks would be twenty-two migration runs.
Seed once: one organization, one region set, one record per case in `habitats`
(it is `geometry(Geometry, 4326)`, so it holds all three dimensions), then one
assertion pass.

The silent skip is accepted, not fought. `describeDbIntegration` is
`describe.skip` when `TEST_DATABASE_URL` is unset so a developer without Postgres
can run the suite, and CI's `Database integration tests` job runs against a
`postgis/postgis:17-3.5` container and is not optional.

Two unconditional guards in `packages/mapping` close what CI's green tick hides:
a plain unit test over the corpus as data (every case has a unique id, all three
dimensions and both branches appear, the case count matches a checked-in
number), and an assertion in the SQL half that it saw **every case by id**, so a
loop that silently iterates nothing fails instead of passing. Case ids are
stable slugs like `point-on-hole-edge` and appear in failure output.

## Migrating the Region multiselect

`regionMembershipClauses` has ten call sites across five modules:
`adult-surveillance.ts` (traps, collections), `control-operations-map.ts`
(applications, source reductions, biocontrol actions, outreach actions),
`foundation-geography.ts` (addresses), `habitats.ts` (habitats), and
`larval-surveillance.ts` (inspections, twice).

All ten migrate, including the three that can only ever take the point path.
Leaving them on the old function keeps two helpers alive, and the one that
survives untouched is the one somebody copies for the next map surface.

Six tables can change answer: habitats, inspections, applications, source
reductions, biocontrol actions, outreach actions, all `geometry(Geometry, 4326)`.
`addresses`, `traps` and `collections` are `geometry(Point, 4326)`, so the rule
change cannot reach them.

It ships on its own branch **after** the endpoint, with a `Changed:` changeset on
`apps/web` carrying a measured blast radius. The measurement query is on
[#248](https://github.com/thebigthing313/simmer-mosquito/issues/248); read
`records_that_vanish` first, since those are the records a user filtering by
district stops seeing entirely. Expectation is close to zero, because sharing
exactly an edge with no interior overlap needs geometry digitized from the region
boundary rather than drawn freehand, but expectation and number are not the same
thing. Every pair the second query names should be a record that genuinely only
touches a boundary; a row that looks wrong means the predicate is excluding real
overlap, and the migration stops.

`Changed:` rather than `Fixed:`, because a user who has been filtering by
district for months got answers that were defensible under the documented rule,
and saved habits may now produce different counts.

### The client path needs no change

`use-region-membership.ts` is used by exactly two pages, `gis/addresses` and
`public-engagement/service-requests`. Both `addresses` and `service_requests` are
`geometry(Point, 4326)`, points keep plain intersection, and
`geometryContainsLngLat` already counts a boundary hit as inside.

That is correct only by accident of those two column types. If either becomes
`geometry(Geometry, 4326)` the way habitats did, `useRegionMembership` keeps
answering from a centroid and silently diverges from the server, and the client
cannot detect it from the `LngLat` it was handed. So: a test asserting both
tables are point-typed, reading the column type from the generated row schemas,
in the same coverage family as the whitelist test.

## Mobile

Mobile has to answer this with no server, so the predicate has to run
client-side over locally persisted region geometry. **What that sync shape is
stays unspecified here.** Regions will not be the only table needing geometry on
a device, so the offline set gets specced as a whole.

What is settled is what the predicate is built on.

GEOS is unreachable. Hermes exposes no `WebAssembly` global: `lib/VM/JSLib/` has
no WebAssembly file, `facebook/hermes` issue #429 is open with no linked PR and
was last updated 2025-02-11, and React Native release bodies 0.84 through 0.87
contain zero occurrences of "wasm". The maintainer's answer on #429 is asm.js
encoded Wasm behind a `HERMES_RUN_WASM` build flag disabled in the default build.
One vendor blog claims otherwise and is the source every search summary repeats;
the check is one line on a device, `typeof global.WebAssembly`. So `geos.js` and
`geos-wasm` are out.

`turf` is disqualified on correctness. `booleanIntersects && !booleanTouches` is
algebraically right, but turf's polygon-versus-polygon `booleanTouches` is
outer-ring vertex sampling that indexes `coordinates[0]` on both sides, so holes
are invisible to it and a genuine overlap entered through a shared edge comes
back as touching. Wrong on exactly the corpus cases most likely to disagree.

`@flatten-js/core` looks like the answer and is not: real DE-9IM, MIT, best
maintained, 56 KB gzip, but its dispatcher has no Point branch and no polyline
branch, and it carries a global `DP_TOL` of 1e-6, roughly 11 cm on the ground,
against `geometryContainsLngLat`'s 1e-12. That is two client-side membership
answers eleven centimetres apart inside one app, and the corpus would not catch
it, because its boundary cases use shared literals. Agency-drawn geometry would.

**Hand-roll in `packages/mapping` with `robust-predicates`** as the one runtime
dependency: Unlicense, zero dependencies, 1.0 KB gzip for `orient2d`. Roughly
250 to 450 new lines on top of the existing 75. The argument that decides it is
that a hand-rolled implementation agrees with `geometryContainsLngLat` by
construction rather than by argument: there is one place where "does a hole's
edge count as inside" is decided, and every dimension reads it.

Scope, given the region side is always one polygon with optional holes. Point
versus polygon is already done. Line versus polygon is 60 to 90 lines, and the
hard part is collinear overlapping segments, where the cross-product sign test
says nothing and a separate branch has to project onto the dominant axis and
compare intervals. Polygon versus polygon is 180 to 350 lines and that estimate
is the least trustworthy, with three places that bite: vertex-touching, where an
overlap entered through a shared vertex and a mere kiss at a vertex differ only
in the cyclic order of the four edges around it, so it ends in an angular sort;
collinear overlapping segments again, worse; and the representative interior
point, because a centroid can fall outside a concave polygon or inside a hole,
which is what PostGIS has `ST_PointOnSurface` for. Under all three sits the sign
of a 2x2 determinant, wrong in doubles near zero, and near zero is where every
one of those cases lives.

Add `jsts` as a **devDependency oracle** for the corpus either way. The
expectations are hand-written by design, and a hand-written expectation checked
by a hand-rolled implementation is one pair of eyes checking itself. 107 KB gzip
is too much to ship for one predicate and free as a test-only third voice from
the same JTS lineage PostGIS runs through GEOS. Fall back to `jsts` at runtime
only with evidence, if the hand-rolled area case proves unstable against real
agency geometry.

The corpus is the gate mobile passes before it answers offline.

### When web and mobile disagree

They can, and the first person to find out will be someone looking at the same
record on a phone and a laptop. The corpus is twenty-two cases; agency-drawn
polygons are not the corpus, and the failure mode of a hand-rolled overlay is a
wrong boolean on one record with nothing to make it visible.

The server is the reconciler. A device's answer is a local read for working
offline, not a second authority, so when a device is online the panel reads the
endpoint. A reported disagreement is a corpus bug first: the case that
reproduces it is added to the corpus before either implementation is touched,
and both halves then have to pass it.

## Build order

Three branches, in this order, because call sites cannot point at a helper that
does not exist and the corpus is what makes the migration provably safe rather
than argued safe.

1. Helper, corpus and endpoint. No changeset; nothing a user can do changes.
2. The panel, the `weather_sources` map card, and the 13 surfaces. `Added:` on
   `apps/web`. The weather card ships inside this changeset rather than carrying
   its own.
3. The multiselect migration. `Changed:` on `apps/web` with the measured blast
   radius.

Shipping 2 and 3 together would produce one changelog entry conflating "there is
a new regions panel" with "your district filter now returns different records".

## Measurements and their caveats

Measured on production, one agency, 345 live regions in 4 folders, 0 unfiled,
average 329 vertices and max 4038, 113,571 total.

| surface | records | total | per record |
| --- | --- | --- | --- |
| worst single region | 1 | 26.7 ms | 26.7 ms |
| every region against every region | 345 | 584 ms | 1.7 ms |
| habitats (points) | 1000 | 47.6 ms | 0.048 ms |

Point records average four bounding-box candidates, two of which survive the
exact test. Cost tracks candidates times their vertex count, not library size;
the worst record here drew 92 candidates at roughly 2000 vertices each. Linear
extrapolation puts the region detail page near 250 ms at about 10x that
candidate-and-vertex product. Ordinary detail pages have four orders of
magnitude of headroom and are not worth watching.

Three things to check when it is built rather than assume.

Planning time is a third of the region page's cost, 10.7 ms against 26.7 ms of
execution. Whether it amortizes depends on whether the query reaches Postgres as
a prepared statement or as fresh SQL per request, and 37 ms and 27 ms are
different numbers. Not material on the 0.048 ms surfaces.

No empty geometry exists in any of the 15 tables today, but the schema still
admits it: `POLYGON EMPTY` passes both `not null` and the `geometrytype` check,
and only the domain validator stops it, on the write path only. The predicate
returns false rather than erroring, so this is not a correctness risk, and
nothing should be built assuming non-empty geometry as an invariant.

Production holds one agency. 345 regions is a real number, not a distribution,
and 4 folders reflects early adoption rather than a ceiling. Coverage there is
partial and uneven: Municipalities and Sections cover every record, Airspray
Sites 10% and County Parks 3%, so a typical record shows two folder rows, not
four. That is the "only folders with a hit" rule earning its keep, and it also
makes the empty state rare for this agency, appearing mostly for records
digitized outside the agency boundary, which reads more like a data-quality
signal than an ordinary state.

Folders partition space in practice and nothing enforces it. `region_folder_id`
is nullable and no constraint stops two regions in one folder covering the same
point, so the panel renders N chips per folder correctly and just will not
usually have to. Anything hard-coding one region per folder is wrong.
