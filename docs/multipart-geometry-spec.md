# Multipart geometry and polygon holes

What it takes for one record to hold a shape in several pieces, and for a
polygon to hold a hole. The rule and why it was chosen are ADR 0018; this is
what gets built.

All six slices of the build order below are built: the register, the domain types
and the covers-ground rule, the columns and region membership, the draw control's
parts and holes, and the import path. Two things it names as out of scope have
their own issues: #445, continuing a finished part, and #446, importing a point.
Both are built. Every decision below was settled on the map in #415, whose nine
tickets hold the measurements and the rejected alternatives.
Where a line says "measured", the numbers came from the local compose Postgres or
from a production clone.

## What drives it

Two failures in the shipped app.

A Region that genuinely needs disjoint parts cannot be one Region. Importing a
county parks file where "Park A" is one park on three separated lots produces
three Regions, because `flattenGeometries`
(`packages/mapping/src/geometry-import.ts:257-277`) and `flattenPolygons`
(`apps/web/src/routes/gis/regions/-import-parse.ts:55-71`) split per geometry
rather than per Feature. The import does not refuse the MultiPolygon, it
dissolves it and says nothing.

An Application whose treated area is disjoint has nowhere to go either. A crew
that splits a block for traffic or access records two records, or one record
that overstates its coverage.

## The shape of the change

Six shapes instead of three: Point, LineString, Polygon, MultiPoint,
MultiLineString, MultiPolygon. A record promotes to the multi form when it gains
a second part and demotes when it loses one, on the same row and the same id. A
one-part MultiPolygon never exists.

Polygon holes need no storage change. `normalizeRings` already keeps interior
rings, so a Polygon with a hole imports and stores today. The gap is the draw
control, which can only ever build one ring.

Existing rows keep their type and are never rewritten. There is no backfill in
this effort.

## The matrix

Which record kind accepts which shapes. Settled table by table in #416.

| Table | Kind | Shapes | Mechanism |
|---|---|---|---|
| `addresses` | `address` | Point | unchanged |
| `traps` | `trap` | Point | unchanged |
| `collections` | `collection` | Point | unchanged |
| `service_requests` | `serviceRequest` | Point | unchanged |
| `weather_sources` | `weatherStation` | Point | unchanged |
| `regions` | `region` | Polygon, MultiPolygon | typmod widening plus a new CHECK |
| `habitats` | `habitat` | all six | CHECK swap |
| `inspections` | `inspection` | all six | CHECK swap |
| `applications` | `controlAction` | all six | CHECK swap |
| `source_reductions` | `controlAction` | all six | CHECK swap |
| `outreach_actions` | `controlAction` | all six | CHECK swap |
| `biocontrol_actions` | `controlAction` | all six | CHECK swap |
| `requested_control_actions` | `requestedControlAction` | all six | CHECK swap |
| `mission_items` | `missionItem` | all six | CHECK swap |
| `notification_registrations` | `notificationRegistration` | Point, Polygon | CHECK swap, narrowing |

Nine CHECKs change, one typmod changes, five tables are untouched.

### Why the five Point tables stay Point

A Trap is one device, a Collection came out of one Trap, a Weather Source is one
station, an Address and a Service Request are one place. None has a story where a
second part is anything but a typo, and the typmod is what catches it. Widening
them would cost five more table rewrites and drop a constraint doing real work.

### Why MultiPoint is in scope

Catch-basin larviciding treats a set of separated points in one visit. Recorded
as a Polygon drawn around the block, the record claims treatment of everything
between the basins, which is wrong on a pesticide record. So MultiPoint is real
wherever the work record is, and the effort does not narrow to areas and lines.

### Why the eight work-record tables stay uniform

They already share one policy, `LOCATABLE_GEOMETRY_TYPES`, three base shapes with
no per-table narrowing. Widening them together keeps that. Per-table narrowing
turns one policy into eight and gives the matrix eight places to drift.

Whether three puddles a few metres apart are one Habitat or three is the agency's
call. That is an SOP, not configuration: there is no per-Agency geometry setting,
and neither the SQL CHECK nor the import path could read one.

### Why Notification Registrations narrow

This is the one row that breaks uniformity and the one narrowing in the effort. A
Registration is a subscription tied to a place. Two places are two Registrations,
which is what lets one be removed without the other, so the Multi variants have a
better answer already in the model. LineString goes because a line-shaped
notification area has no story and no UI.

The narrowing converts nothing: production holds no `notification_registrations`
rows, so the CHECK swap cannot fail on existing data. The migration states that
as its precondition rather than leaving it implicit.

## The register

`OWNED_GEOMETRY_POLICIES` (`packages/domain/src/shared.ts:69-110`) is promoted
from decoration to the single source of the matrix, and gains a `tables` field
naming the 15 tables its 12 kinds cover. `controlAction` alone covers
`applications`, `source_reductions`, `outreach_actions` and `biocontrol_actions`.

It stays keyed by the 12 `OwnedGeometryKind`s rather than by table. The kind is
the domain concept the draw control and the validator speak; the table is
storage. Collapsing to 15 table-keyed rows writes the one control-action policy
out four times.

`allowedTypes` keeps one meaning, the storable set, so `Polygon` and
`MultiPolygon` are listed separately. There is no multipart flag and no second
field. Draw modes are derived by normalizing that set to base types, a derivation
that is total: every Multi shape has exactly one base, and under promote-in-place
the base is always in the set beside it. Two hand-written lists on one record
would be the drift the gate exists to catch.

### What gets deleted rather than checked

The matrix is written in seven places today and nothing holds them to each other.
#418 found three the ticket had not listed. Four of the seven are deleted:

- The private copies at `packages/domain/src/location-intent.ts:132-133`. The
  `validate*LocationSource` functions take an `OwnedGeometryKind` and read
  `allowedTypes` off the row.
- The draw-mode lists at
  `apps/web/src/components/map/geometry-control.tsx:45,52,58`, `isDrawGeometryType`
  at `:404-406`, and the inline three-way guards at
  `habitats/$id_.edit.tsx:224-226`, `inspections/$id_.edit.tsx:346` and
  `region-boundary-picker.tsx:248`. The control derives its modes from
  `allowedTypes` and the three guards collapse into one predicate.
- The normalizer call sites. `normalizePointGeometry`, `normalizeRegionGeometry`
  and `normalizeLocatableGeometry` are picked by hand per domain at
  `foundation/shared.ts:137`, `mission-dispatch/shared.ts:188`,
  `weather/shared.ts:102` and `public-engagement/core.ts:591`, so the matrix is
  keyed by call site there. They take a kind instead.
- `REGISTRATION_GEOMETRY_TYPES` at `public-engagement/core.ts:209`.

`POLYGON_KINDS` and `LINE_KINDS` stop being exported from `packages/mapping`.
`collectImportGroups` and `flattenGeometries` keep taking a kinds argument and
their three callers derive it from the register. All three are in `apps/web`,
which already depends on `packages/domain`. Mapping stays dependency-free rather
than taking domain as a dependency, which would put the geometry primitives under
the domain types.

## The domain types

`packages/domain/src/shared.ts` is the canonical union and it is closed at three.
It opens to six. Settled in #422.

### Flat six, no wrapper

`SupportedGeometryType` becomes six string literals and `SupportedGeoJsonGeometry`
six interfaces. No parts wrapper and no base-type-plus-multiplicity pair.

A structured pair (`{ base: 'Polygon'; parts: Ring[][] }`) makes promote and
demote free, because you never store a type and multiplicity falls out of part
count. It stops being GeoJSON, and GeoJSON is what crosses every seam in this
stack: the command payload, `st_geomfromgeojson`, the Mapbox source, the import
file, `packages/mapping`. A wrapper buys one derived field and pays a conversion
at each of those, and the `type` discriminant comes back the moment anything
serializes.

Flat six is also the shape the workspace already proved out. `packages/mapping`
has modelled it since before this effort: `GeoJsonGeometry`
(`packages/mapping/src/geometry.ts:45`), six interfaces at `:15-43`, and
`countGeoJsonVertices` (`:347`) exhaustive over all six with per-part reduces.

### The two unions stay separate

At six, `packages/domain`'s union is structurally identical to
`packages/mapping`'s. Both packages are leaves, so domain could depend on mapping
and re-export. It does not.

They answer different questions. Mapping's union is "any GeoJSON I might be
handed", including the import file and the tile decoder. Domain's is "what a
command may carry", the smaller closed set the validator holds callers to. They
are equal today by coincidence of there being six OGC shapes, and the equality
breaks the first time mapping needs `GeometryCollection` to read an import file
this effort has ruled out as a record geometry.

The cost settles it. `packages/domain` is imported by every app and package that
writes, so an edge out of it is a package.json dependency, a tsconfig
`references` entry and a `check:build-graph` edge paid forever, to delete about
thirty lines of type declarations with no logic in them. It would also be the
first production edge into `packages/mapping`, which `packages/db` deliberately
carries as a devDependency only.

`fallow dupes` will see the two copies. That is the right call for it to flag and
the right call to leave: the threshold in `.fallowrc.jsonc` is a ratchet against
making things worse, and six type aliases is the cheapest possible worse.

### Promote and demote run in the builder, silently

The layer is `validateGeometry` (`packages/domain/src/shared.ts:150`). A Multi
arriving with one part is rewritten to its base shape and stored as the base
shape. No rejection and no second enforcement point.

Silent, because a one-part Multi is a tool artifact and not a user error.
`ogr2ogr` emits MultiPolygon for every feature in a shapefile, including the
single-lot ones. Today `flattenPolygons` demotes those by accident, as a side
effect of splitting Multi into parts, and one row per Feature deletes that arm. So
without demote in the builder every single-lot park imported from a shapefile
would store as a one-part MultiPolygon. Verified against the local Postgres:
`st_geomfromgeojson` preserves the Multi type, so a one-part MultiPolygon comes
back `ST_MultiPolygon`. Demote is the common import path, not a defensive corner.

The builder is the one place both writers pass through. The table-command
handlers call the domain builders on every command
(`apps/server/src/table-commands/applications.ts:154`), and the import path is a
command like any other. It is context-free, so its test is a unit test.

Three other layers were considered and dropped, all as redundant once the builder
runs it:

- SQL inside `geojsonToGeom` (`packages/db/src/domains/org-owned-writes.ts:156`).
  `ST_CollectionHomogenize` is an exact demote, verified: a one-part MultiPolygon
  returns `ST_Polygon`, a two-part one stays `ST_MultiPolygon`, a one-part
  MultiPoint returns `ST_Point`. It is three edits, because `geojsonToGeom` exists
  in three copies.
- A trigger beside `set_owned_centroid`, on nine tables.
- A CHECK refusing a one-part Multi. This is the only option that makes the rule
  an enforced invariant rather than a convention, and it is still a no. The nine
  CHECK swaps are type lists and the static gate compares a type list against
  `allowedTypes`. A CHECK carrying
  `st_numgeometries(geom) > 1 or geometrytype(geom) not like 'MULTI%'` is not a
  type list, so it either escapes the gate or forces the gate to parse predicates.

### The optimistic row lags by one sync

`mutateCollection` does not run the domain builder. It sends the payload and the
server builds, so the optimistic `geom_type` comes from
`ownedCentroidFromGeoJson` (`packages/mapping/src/geometry.ts:298`), which reads
the GeoJSON `type` directly. A one-part Multi would show as Multi until Electric
confirms the demoted row.

No user meets this. The draw control promotes and demotes as parts are added and
removed, so a drawn shape never reaches the wire as a one-part Multi, and the
import path has no optimistic row.

### The inheritance path needs no normalization

`resolveLocationGeom` (`apps/server/src/location-source.ts:39`) copies another
row's geometry through `loadGeojson` and `geojsonToGeom`, bypassing the domain
builder. That is safe by induction: the copy is type-preserving and the source row
was normalized by the builder on its own write.

It is safe on shape too, checked against the matrix. Every source kind is either
Point-only (`address`, `trap`, `collection`, `serviceRequest`) or all-six
(`habitat`, `inspection`, `requestedControlAction`, `missionItem`), and no
Point-only target inherits from an all-six source. This is the seam that would
quietly break if a future source kind crossed that line.

### Validators are the existing three, mapped over parts

Nothing is reimplemented and nothing is relaxed, so per-part ring closure and the
two-position minimum come for free:

- `MultiPoint`: `validatePosition` (`:245`) per part.
- `MultiLineString`: `validateLineStringCoordinates` (`:198`) per part, which
  carries the two-position minimum.
- `MultiPolygon`: `validatePolygonCoordinates` (`:214`) per part, which carries
  the at-least-one-ring rule, the four-position ring minimum, and ring closure.

Minimum one part, not two. Two is the invariant demote enforces, and rejecting a
one-part Multi would reject exactly the `ogr2ogr` case demote exists to accept.
Zero parts is an issue: `coordinates: []` has nothing to demote to, so it pushes
`<path>.coordinates must include at least one part`.

### fallbackLocationSource stops synthesizing a typed geometry

`fallbackLocationSource` (`packages/domain/src/location-intent.ts:404-414`) loses
its `allowedGeometryTypes` parameter and returns one unconditional
`{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } }`, with a
comment saying it is the unreachable placeholder that keeps issue collection
running.

All three call sites (`:317`, `:326`, `:401`) are reached only after pushing an
issue, and the caller throws `DomainValidationError` once issues are non-empty, so
the value is never observed by a successful write. It has been nonsense for
`Polygon` since it shipped, not only for the Multi shapes. Collect-then-throw
stays, because throwing inside the fallback would lose the issues of sibling
fields on the same command.

This deletes a branch that would otherwise have grown six arms for no reader.

## Covering ground

Settled in #434, which graduated out of the map's fog once the type shape was
fixed.

### The rule

A stored geometry must cover ground. A LineString needs positive length. A
Polygon needs positive area, counting the outer ring less its holes. A Point is
exempt: it has no measure, and the position rule already rejects
`coordinates: []`, so `POINT EMPTY` cannot be built from a GeoJSON payload.

Strictly greater than zero, with no epsilon. Any threshold is a claim about the
smallest treatment area an agency records, and nobody has that number.

### Why not the other two nets

`ST_IsEmpty` alone misses the degenerate ring, which is the only case reachable
through the app today. `POLYGON((0 0,0 0,0 0,0 0))` is not empty: it has four
positions, matching first and last, and zero area. It passes
`validatePolygonCoordinates`, stores with `st_area` 0, and PostGIS inserts it
after a `NOTICE: Too few points in geometry component`.

`ST_IsValid` was ruled out by measurement. 15 of 345 production Regions fail it,
all self-intersections, all in `regions`, with every other table clean across
194,184 geometry rows. A validity gate would refuse 4% of one agency's live
Regions the next time anyone saved one. Filed separately as #437, because a
relate on an invalid geometry is undefined in GEOS and those 15 rows have a
membership answer nobody has checked.

### Rejection is per write, named per part

A Multi whose parts are one real shape and one degenerate one rejects the whole
write, naming the part. It never drops the part.

Dropping looks like demote and is not the same act. Demote is lossless, since a
one-part MultiPolygon and a Polygon are the same shape. Dropping a part throws
away something the user drew, and it cascades: a two-part Multi that loses a part
then demotes, so one silent normalization triggers another.

Rejection costs nothing to build. `validateGeometry` already carries
`DomainValidationIssue` with a path, so `geometry.coordinates.1` names the
offending part with no new machinery, and it matches the zero-parts rejection
above.

### One predicate, three call sites

Exported from `packages/domain` and called from:

1. `validateGeometry`, beside demote. Every command-carried geometry becomes a
   400 at build time with the part-indexed path.
2. `loadOr404` (`apps/server/src/location-source.ts:84-95`), raising
   `CommandError(400, ...)` naming the source table and id. This is the inherited
   path and the only layer that knows which record the geometry came from, so "go
   fix that Habitat" is sayable only here.
3. `geojsonToGeom`, the backstop. It is the one function structurally guaranteed
   to see every value reaching a `geom` column, including `packages/db`'s own
   writers, which never pass a domain builder.

`packages/db` already depends on `@simmer-mosquito/domain` in production, so none
of this needs a new package edge.

Two things the third placement requires. `handleCommandError` has to grow a
`DomainValidationError` arm first: it imports the symbol at
`command-endpoint.ts:37` and has no arm for it, so a throw from inside the
transaction falls to the closing `throw error` at `:181` and answers 500. That is
#436, landing ahead. And the three copies of `geojsonToGeom` collapse to one: the
exported copy in `org-owned-writes.ts:156` plus private copies at
`adult-surveillance.ts:104` and `foundation-geography.ts:126`. The bodies are
already identical, so it is a delete and an import, and it is smaller than writing
the rule three times.

### What the predicate computes with

`packages/domain` has zero dependencies and cannot reach `ringAreaMeters`. It
gets a planar test on raw degrees: a ring encloses nothing when its positions are
collinear, a line has no length when its positions all coincide.

This is not a copy of `packages/mapping/src/measurement.ts` and it is not the
rejected domain-to-mapping edge either. The predicate asks whether the shape
encloses anything, not how much, so metres are not the unit of the answer and no
earth radius is needed. A planar-degenerate ring is a path walked out and back,
which encloses nothing on a plane or on a sphere, so the spherical and planar
answers agree about zero and differ only about how much nonzero area there is.
`packages/domain` stays a leaf.

### No CHECK constraint

`check (not st_isempty(geom))` catches only the net that is useless alone. A CHECK
matching the real predicate would re-derive per-type dispatch in SQL and call
`st_area` or `st_length` on every write, its 23514 answers 500 until
`handleCommandError` grows a second arm, and it cannot say which part failed. The
static gate reads CHECKs from the catalog as the type list, so a second CHECK on
each of the ten tables is more for it to walk past.

The refusal is asserted by an integration test that posts a degenerate geometry
and reads the 400, which exercises the rule rather than restating it.

### The two client gates

`canFinish` (`use-map-draw.ts:370`) and `geometryFromVertices` (`:467-469`) both
run the predicate, or the button lies about what Finish will do. Three clicks in
one spot currently passes `vertices.length < 3` and finishes a zero-area Polygon,
so this is not import-only. After this, Finish stays disabled and the only user
who meets the server refusal is one whose geometry arrived from a file or an API.

`normalizeRings` (`packages/mapping/src/geometry-import.ts:290-306`) loses its
`closed.length >= 4` check. Its comment claims "Three distinct corners plus the
closing position is the smallest area" and it counts positions, so
`[[0,0],[0,0],[0,0],[0,0]]` passes the filter that reads as if it caught it. Two
checks claiming the same thing and disagreeing is how that comment came to lie.
The real predicate replaces it.

### Existing rows

Nothing looks and nothing backfills, because there is nothing there. Measured
across all 15 geometry tables in a production clone: zero rows that are empty,
zero-area or zero-length.

| Table | Rows with geometry | Degenerate |
| --- | --- | --- |
| inspections | 106,307 | 0 |
| applications | 55,203 | 0 |
| habitats | 15,325 | 0 |
| addresses | 9,818 | 0 |
| collections | 4,586 | 0 |
| service_requests | 1,180 | 0 |
| source_reductions | 999 | 0 |
| traps | 417 | 0 |
| regions | 345 | 0 |
| mission_items | 3 | 0 |
| outreach_actions | 1 | 0 |

The rule is preventive, not remedial. The induction that inherited geometry needs
no normalization holds today by measurement; call site 2 is what makes it hold by
construction from here on.

## The migrations

### Nine CHECK swaps

Each of the nine `geometry(Geometry,4326)` tables carries
`check (geometrytype(geom) in ('POINT','LINESTRING','POLYGON'))`
(`packages/db/migrations/202605270001_owned_geometry_columns.sql:149,158,167,176,185,194,203,212,228`).
Eight widen to all six names. `notification_registrations` narrows to
`('POINT','POLYGON')`.

A CHECK swap is cheap and it is invisible to the replication stream. Measured:
0 decoded messages, 0 bytes on the wire, 4,456 bytes through the reorder buffer
with no spill, 4,752 bytes of WAL.

### Regions

`regions.geom` is `geometry(Polygon,4326)`, so it costs a rewrite. The one-line
`alter column type` does not run: two things depend on the column and Postgres
reports them one at a time, both SQLSTATE `0A000`. `geojson` is still
`generated always as (st_asgeojson(geom)::jsonb) stored`, and `regions_centroid`
is `before insert or update of geom`, where naming the column in that list is
what creates the dependency.

`alter column ... set expression` does not rescue this. It only replaces the
expression of a column that is still generated, and there is no way to keep
`geojson` generated across the type change.

`lat`, `lng` and `geom_type` stopped being generated columns in
`202607070001_sync_owned_centroid_columns`. They are ordinary columns written by
the trigger, so they block nothing and need no re-adding. Only `geojson` matters.

```sql
-- migrate:up

-- geojson is a stored generated column over geom, and regions_centroid names
-- geom in its `update of` list. Postgres refuses `alter column type` with
-- SQLSTATE 0A000 while either one depends on the column, so both come off first
-- and go back after. Keeping the drop, the retype and the re-add in one
-- `alter table` is what makes this one rewrite instead of two: 494 KB of WAL
-- rather than 811 KB, and the CHECK validates against the rewritten heap in the
-- same pass.
drop trigger regions_centroid on regions;

alter table regions
  drop column geojson,
  alter column geom type geometry(Geometry, 4326),
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add constraint regions_geom_type_check
    check (geometrytype(geom) in ('POLYGON', 'MULTIPOLYGON'));

create trigger regions_centroid
  before insert or update of geom on regions
  for each row execute function set_owned_centroid();

-- The type change drops geom's pg_stats row. Without this the GiST scan
-- estimates 1 row where 43 come back.
analyze regions;
```

One `alter table`, not five statements. Postgres collapses every rewrite-forcing
subcommand of a single `ALTER TABLE` into one rewrite pass, and its internal pass
order runs drop, then alter type, then add column, then add constraint, which is
the order needed. Confirmed as one rewrite rather than two by reading
`relfilenode` between subcommands inside the transaction: the separate form passes
through three filenodes, the combined form through two.

| rows | separate | combined | saved |
| --- | --- | --- | --- |
| 345 | 810,536 B | 494,488 B | 39.0% |
| 200,000 | 416,115,792 B | 254,783,192 B | 38.8% |

Verified end state: `geom` is `geometry(Geometry,4326)` and still `not null`,
`geojson` regenerates, the trigger fires and stamps `geom_type` as
`st_multipolygon`, `relreplident` stays `f`, and all four indexes come out
`indisvalid` and `indisready`. No reindex is needed. What is needed is the
`analyze`: the type change drops `geom`'s `pg_stats` row and the planner estimates
1 row against 43 actual until it runs.

### The new CHECK is not optional

After the widening the typmod stops being the constraint and a bare Point inserts
happily, with the trigger stamping `geom_type = 'st_point'`.
`geometry(Polygon,4326)` was the only guard. `regions` carries no CHECK constraint
at all today and the name `regions_geom_type_check` appears in neither the
database nor the repo, so it is free and it matches the nine existing names.

Use `geometrytype()`, not `st_geometrytype()`. The two share no vocabulary:
`geometrytype()` returns bare uppercase `POLYGON`, `st_geometrytype()` returns
`ST_Polygon`, and the `geom_type` column lowercases that to `st_polygon`. Neither
list is usable in the other place.

Verified after the widening: Polygon and MultiPolygon insert; Point, LineString,
MultiPoint, MultiLineString and GeometryCollection are each rejected by name. A
GeometryCollection cannot slip the two-name list, because `geometrytype()` reports
the container even when every member is a Polygon. A check written against member
types would have let it through.

Plain `add constraint`, not `not valid` plus `validate constraint`. The split
shortens the blocking lock from 82 ms to 20 ms at 200,000 rows while making total
wall clock worse, and at 345 rows it saves 10 ms of a lock the surrounding rewrite
holds anyway. It also cannot work as intended: every migration here runs in one
transaction, so `validate constraint` holds the earlier `AccessExclusiveLock`
until commit.

Dimension stays the typmod's job. `geometrytype()` erases the Z suffix, but
`geometry(Geometry,4326)` is a 2D typmod and refuses `POLYGON Z` before the CHECK
runs, identically before and after.

### What the rewrite costs the replication slot

This is the question that mattered, because pointing a heavy transaction at a slot
is how staging's walsender died twice (#166, #236).

Zero on the wire. 0 decoded row changes and 0 bytes under both `test_decoding` and
`pgoutput`, at 345 rows and again at 200,000. Postgres writes the rewrite into a
transient heap whose `pg_class.relrewrite` points back at the original, and the
reorder buffer drops changes on such a relation at replay time rather than handing
them to the output plugin. Electric's subscriber sees an empty transaction and no
client resyncs a single Region.

The cost that is real sits in the reorder buffer and is linear in heap bytes:

| | on the wire | reorder buffer | WAL |
| --- | --- | --- | --- |
| widening at 345 rows | 0 messages, 0 bytes | 1.42 MB, no spill | 494 KB |
| widening at 200,000 rows | 0 messages, 0 bytes | 760 MB spilled to `pg_replslot/` | 255 MB |
| `update regions set name = name` at 200,000 rows | 200,004 messages, 483 MB | 646 MB spilled | 969 MB |
| a CHECK swap on one of the nine other tables | 0 messages, 0 bytes | 4,456 B, no spill | 4,752 B |

At the size `regions` actually is, 1.42 MB passes through the decoder and is
discarded there, with no spill. That is smaller than what a single
`update regions set name = name` puts on the wire and three orders below the 1 GB
that killed staging. So the migration is safe beside a live Electric slot and
needs no special shape.

Two cautions carried forward. The reorder-buffer cost is linear in heap size, so
if any agency's `regions` ever reaches six figures this puts hundreds of MB
through the slot's buffer and onto disk, still without sending a byte to Electric.
And slot lag read as `pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)` is
useless as a measurement here, because it is cluster-wide and a developer's own
database writes 16 MB every 3 seconds. Use `pg_stat_replication_slots.total_bytes`
with the stats reset first.

Nobody has driven a running Electric through the migration. The zero decoded
changes and the unchanged relation OID say it carries nothing, so the build slice
watches a shape across it rather than assuming.

### The down migration refuses

Every other migration in this set rolls back whatever the data looks like. This
one can refuse, and it does.

With one MultiPolygon present the narrowing fails with SQLSTATE `22023`,
`Geometry type (MultiPolygon) does not match column type (Polygon)`, raised by
`postgis_valid_typmod` as the rewrite casts each tuple. The message names no
table, no column and no row, and it is the same message wherever the offending row
sits physically. With no MultiPolygon present the rollback runs clean, so the
failure is data-dependent rather than a broken down section.

A soft-deleted MultiPolygon blocks the rollback exactly like a live one. The
typmod re-check reads heap tuples and a soft-deleted row is a live heap tuple. So
a precondition written `where deleted_at is null` reports zero and then hands the
developer the bare `22023` it was supposed to spare them. Every read in the app
skips soft-deleted Regions, which is what makes this the natural way to write it
wrong.

`ST_Dump` is out. A Region with three disjoint lots is one Region with one id, one
name, one folder, and rows in `search_documents` keyed to that id. Splitting it
invents ids and names for parts nobody named, at the moment somebody is already in
trouble, and it contradicts no-backfill: down would rewrite rows that up never
touched.

Fail-loudly is out because the migration already knows the three things the
developer would otherwise have to deduce: which column, which rows, and that
soft-deleted rows count.

```sql
-- migrate:down

-- Every other migration in this set rolls back whatever the data looks like.
-- This one can refuse. Narrowing geom back makes Postgres re-check the typmod on
-- every row, and one MultiPolygon aborts the rewrite with SQLSTATE 22023, naming
-- no table, no column and no row. ST_Dump would clear the way by splitting each
-- multipart Region into one row per part, inventing ids and names for parts
-- nobody named, so this refuses and names the rows instead.
--
-- The count reads geometrytype(geom) rather than the geom_type column, because
-- geom_type is maintained by regions_centroid and the thing that fails reads the
-- geometry. It ignores deleted_at on purpose: the re-check reads soft-deleted
-- rows too, though every read in the app skips them. Everything a reader needs
-- goes in the message, because dbmate prints the message and drops detail and
-- hint.
do $$
declare
  v_multipart bigint;
begin
  select count(*) into v_multipart
  from regions
  where geometrytype(geom) <> 'POLYGON';

  if v_multipart > 0 then
    raise exception
      'Cannot narrow regions.geom back to geometry(Polygon, 4326): % region row(s) hold a MultiPolygon. List them with: select id, name, deleted_at from regions where geometrytype(geom) <> ''POLYGON''. Soft-deleted rows count. Redraw each one as a single Polygon or hard-delete it, then roll back again.',
      v_multipart;
  end if;
end;
$$;

drop trigger regions_centroid on regions;

alter table regions
  drop constraint if exists regions_geom_type_check,
  drop column geojson,
  alter column geom type geometry(Polygon, 4326),
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored;

create trigger regions_centroid
  before insert or update of geom on regions
  for each row execute function set_owned_centroid();

analyze regions;
```

Two dbmate facts shaped this. dbmate wraps each migration file in a transaction
and no file in this set carries `transaction:false`, so the refusal rolls back the
whole down section and the migration stays recorded as applied; a retry after the
operator fixes the rows is a plain re-run. And dbmate prints `message` and drops
`detail` and `hint`, so a refusal that puts its recovery steps in a `HINT` shows
the developer nothing. That constrains every `raise exception` in this migration
set, not only this one. dbmate also prints `Rolled back: <file>` before it prints
the error, so a success line sits above the failure.

Verified through dbmate three ways: refuses with one live MultiPolygon, refuses
with that same row soft-deleted, and rolls back clean once the row is
hard-deleted. `db:rollback` has exactly one caller and it is a person at a
terminal; nothing in `.github/workflows/` runs it, so no deploy path is blocked by
a refusal.

### Two facts for whoever writes the migration

`geojson` moves to the end of the column list and leaves a dropped-column
tombstone at its old attnum, in both directions and whether the subcommands are
combined or not. This has no checked-in consequence: `packages/db/schema.sql` is
neither tracked nor present, and `scripts/generate-table-schemas.mjs` reads
`packages/db/src/tables.ts` plus the migrations rather than the catalog. It shows
up only if somebody dumps the schema.

`packages/db` needs no TypeScript change. `RegionsTable.geom` is typed
`GeometryColumn` at `packages/db/src/tables.ts:168`, with no shape narrowing. And
`geom` and `geojson` are absent from the synced row schema
(`packages/sync/src/collections/tables/regions.ts`), so no client-visible column
changes type. What clients do see change is `geom_type`, which starts returning
`st_multipolygon`.

## Region membership

Settled in #419, with the full citations in
`docs/research/multipart-region-membership.md`.

### The predicate is already right

`st_relate(region, record, 'T********')` reads DE-9IM cell one,
`dim(I(a) ∩ I(b))`. OGC 99-049 §2.1.12 defines a MultiPolygon's boundary as the
rings of its Polygons and §2.1.13.1 its interior as what remains once boundary
points are removed, with §2.1.12 assertion 5 stating the interior has one
connected component per Polygon. So a MultiPolygon's interior is the union of its
parts' interiors, and cell one is non-empty exactly when some part's interior
meets the region's.

That reading is existential rather than universal: a record with one part
interior-inside is a member, and a record whose every part only abuts the boundary
is excluded, because a union of empty sets is empty. §2.1.13.2 pins the Area/Area
cell to `{-1, 2}`, so `T` there means real shared area, never a point or a line.
§2.1.13.3 puts Polygon and MultiPolygon in the same class `A`, which is the
citation that the areal rule is unchanged by multipart.

A MultiPolygon region behaves the same. Set intersection commutes, so cell one is
symmetric even though the full matrix is not, and no predicate change is needed
when `regions.geom` widens. The `&&` bbox prefilter gets looser, because a
multipart bbox spans the gaps between parts, which costs candidates rather than
correctness.

### The case around it is wrong

`packages/db/src/domains/map-region-filter.ts:95` branches on
`geom_type = 'st_polygon'` alone, so a MultiPolygon falls to plain
`st_intersects` and a boundary touch counts as inside.

```sql
case
  when geom_type in ('st_polygon', 'st_multipolygon')
    then st_relate(region_geom, geom, 'T********')
  else st_intersects(region_geom, geom)
end
```

Widen the literal list rather than normalizing. `packages/db` carries
`@simmer-mosquito/mapping` as a devDependency, verified in
`packages/db/package.json`, so `normalizeGeomType` is not callable from shipped
query-builder code. The SQL version degrades to
`replace(geom_type, 'st_multi', 'st_') = 'st_polygon'`, a string trick that only
looks like normalization, and it is a text function on a stored column repeated
across 29 occurrences of `map-surface-sql.snap.sql`. The areal set is closed at
two names: GeometryCollection is out of scope and the Point typmods stay.

Every tileset embeds this case expression, so
`packages/db/src/tests/unit/domains/__snapshots__/map-surface-sql.snap.sql` moves.

### MultiLineString and MultiPoint stay on plain intersection

Not inherited. A MultiPoint's boundary is the empty set, so an interior rule would
still exclude a point standing on a district line, which is the outcome ADR 0015
rejected on purpose. A MultiLineString gains a second, independent reason: its
boundary is the mod-2 union of its parts' endpoints rather than the plain union,
so an interior-only rule would answer differently for one LineString than for the
MultiLineString built from its two halves.

### The corpus grows from 22 to 32

`CorpusGeomType` (`packages/mapping/src/test-corpus.ts:72`) opens to six names,
`CorpusCase.record` gains the three multipart GeoJSON types, and
`membershipBranchFor` (`:363-365`) widens to the two areal names.
`REGION_MEMBERSHIP_CORPUS_SIZE` becomes 32. Two assertions in
`test-corpus.test.ts` hard-code three dimensions and need six.

| Case | Arm | Expected |
| --- | --- | --- |
| `multipolygon-all-parts-sharing-an-edge` | interior | false |
| `multipolygon-one-part-inside` | interior | true |
| `multipolygon-part-touching-at-a-vertex` | interior | false |
| `multipolygon-one-part-touching-one-disjoint` | interior | false |
| `multipolygon-all-parts-in-the-hole` | interior | false |
| `multipoint-one-point-inside` | plain | true |
| `multipoint-all-points-on-the-boundary` | plain | true |
| `multilinestring-touching-at-a-node` | plain | true |
| `multipolygon-region-record-in-one-part` | interior | true |
| `multipolygon-region-record-between-parts` | interior | false |

The first two are the discriminating pair.
`multipolygon-all-parts-sharing-an-edge` is the case that fails today.
`multipolygon-one-part-inside` proves the union is existential rather than
universal. The MultiPoint pair pins the existential reading on the plain arm,
where boundary contact still counts. The MultiLineString node touch is the mod-2
tripwire. The last two use the so-far unused `CorpusCase.region` field to give a
MultiPolygon region.

Deliberately excluded: any invalid MultiPolygon, a three-part case, because part
count is not a variable the predicate reads, and a redundant MultiLineString
crossing.

### The corpus lands inside the migration slice

Not before it. The corpus's SQL half seeds every case into `habitats`, whose CHECK
is still `in ('POINT','LINESTRING','POLYGON')`, and seeds its region into
`regions.geom`, still typed `geometry(Polygon,4326)`. Sequenced any earlier the
new cases fail on the insert rather than on the predicate. The jsts oracle and the
pure unit test have no such constraint.

## The read seam

Settled in #421, which removed work rather than adding it.

The seam already exists: `normalizeGeomType`
(`packages/mapping/src/geometry.ts:307-313`), and it stays where it is. Nothing is
added to the `packages/sync` row schema and no web read-seam hook is introduced.

Sweeping the workspace for raw literal comparisons on `geom_type` turns up two
non-test sites: `map-region-filter.ts:95`, which stays SQL-literal on purpose, and
`test-corpus.ts:365`, the oracle. Both are region-membership's. The premise that
this is "N sites that can each be forgotten independently" measures at two, and
neither is in TypeScript app code. That is what rules out the sync-schema option:
it was the cheapest answer to a problem that turns out not to exist, and it would
put a hand-written derived field in a file whose contract is that it mirrors the
database, while hiding the stored value from the draw control, which needs it.

Checked rather than assumed:

- `formatGeometryTypeLabel` (`geometry.ts:325-344`) already has all six arms plus
  `geometrycollection`, and `countGeoJsonVertices` (`:346-363`) already sums
  parts. Display is multipart-ready today with no change.
- The Mapbox layer filters are safe. In the installed mapbox-gl 3.24.0,
  `geometryTypes = ["Unknown", "Point", "LineString", "Polygon"]` and
  `EvaluationContext.geometryType()` returns that lookup whenever `feature.type`
  is a number. The render path always carries the numeric vector-tile encoding,
  because the worker runs GeoJSON through geojson-vt. So
  `['==', ['geometry-type'], 'Polygon']` matches a MultiPolygon, and
  `use-geojson-layer.ts:42-44` and `use-map-draw.ts:79-82` need nothing. The
  string branch returns `MultiPolygon` verbatim, but only for an expression
  evaluated against a raw GeoJSON feature, which is not the render path.
- `geometryKind` on the 14 view types is pass-through, not a branch. Only
  `map-card.tsx:202` branches, via `isPointGeomType`.

Two places stay on the raw value: `formatGeometryTypeLabel`, which keeps saying
"Multi-polygon" rather than collapsing to "Polygon", and the draw control's part
list. `geometrySummary` (`record-location-card.tsx:247-264`) keeps reading the
label plus a total vertex count, so part-count copy lives in one component rather
than two.

### isArealGeomType is not added

The map committed to it while charting and #421 dropped it. No TypeScript site
asks areal-versus-point on the raw value, so it would ship with no caller, and
nothing would report that: `.fallowrc.jsonc` lists `packages/*/src/index.ts` as an
entry root, so any package-barrel export is reachable by definition and
`fallow dead-code` stays green. `normalizeGeomType` is itself exported with no
caller outside its own file today, which is the standing proof.

The name is also wrong for the model. `isPointGeomType`'s docstring already names
the real cut, "the centroid is the shape", and that rule is total over all six
shapes: only Point has the centroid as the shape, while MultiPoint, both line
types and both polygon types have it standing in for something else. An
areal-versus-point split has no correct answer for MultiPoint. So
`isPointGeomType` stays the single predicate and its docstring is rewritten to
state the rule over all six shapes, so the next reader does not re-derive where
MultiPoint falls.

### The client centroid becomes area-weighted

`centroidFromGeoJson` (`geometry.ts:260-277`) averages vertices. All 15
`*_centroid` triggers run `st_centroid`, which is area-weighted. The two already
disagree for any polygon with uneven vertex spacing, so this is shipped drift
rather than a new bug. Multipart is what makes it visible: a MultiPolygon with one
large part and one small distant part puts the optimistic marker between them, and
it jumps when Electric confirms.

`ownedCentroidFromGeoJson` becomes area-weighted for the areal types, via the
shoelace formula, weighting parts by area for MultiPolygon. Points and lines keep
the current average.

#477 amends this. Points average and lines do not. `st_centroid` weights a
LineString by segment length, so `LINESTRING(0 0, 1 0, 2 0, 10 0)` centroids at
`POINT(5 0)` where the vertex average is `POINT(3.25 0)`, and a MultiLineString
drifts further because a short dense part carries vertices without carrying
length. Lines were left on the average on the belief that PostGIS averaged them
too, so the optimistic marker jumped on confirm for the six record kinds that
store a linear shape. `ownedCentroidFromGeoJson` is length-weighted for both line
types now, weighting parts by their own length, and a line with no length gets
the position PostGIS gives it rather than a division by zero. The round trip
below runs all six shapes instead of filtering the linear two out.

What holds the two together is an integration test in
`owned-geometry.integration.test.ts` that runs the corpus geometries through
`st_centroid` and compares within a tolerance. A unit test with hand-computed
numbers only proves the implementation matches whoever wrote the test; the thing
that has to be true is that it matches PostGIS. It lands in the migration slice
for the same reason the corpus does.

## The draw control

`apps/web/src/components/map/use-map-draw.ts` is our own state machine, not
mapbox-gl-draw, so nothing is imposed on us. Today `geometryFromVertices`
(`:458-470`) always builds `coordinates: [closeRing(vertices)]`: one ring, one
part. Settled in #417, with a prototype on `prototype/417-part-ring-model`.

### The type toggle never says Multi

It stays Point, Line, Polygon. A shape promotes on gaining a second part and
demotes on losing one, and neither is a thing the user selects. Picking
MultiPolygon up front would fight promote-in-place directly: draw one part and
normalization demotes you, so the toggle would lie.

### The part list replaces the summary line at two parts, and only at two

At one part the control is what it is today, which is the visible face of "a
one-part MultiPolygon never exists". Each row hovers to highlight its part on the
map, clicks to zoom to it, and carries Remove.

No reorder, because a MultiPolygon's part order carries no meaning. No
redraw-part, because Remove plus Add piece is the same result and one less mode.
Holes are nested rows under their part, individually removable, one level deep.
The list renders 8 rows with a "Show all N" toggle and caps nothing: the part
count belongs to the data, and a 41st part the database would accept must not send
the user back to the file.

### A hole is cut into a part the user names first

At one part, Cut hole is a button on the control. At two or more, it moves onto
each row. So nothing is hit-tested to decide which part a hole belongs to, which
matters because a click inside two parts only happens in an already-invalid
MultiPolygon: the design deletes the ambiguity instead of resolving it.

This also rules out inferring the gesture from where the first vertex lands, where
an add-part draw starting a few pixels inside an existing part silently becomes a
hole and the user finds out when the fill vanishes.

### Three entry points, and Redraw still means everything

`start()` replaces and clears every part. `startPart()` appends on finish.
`startHole(partIndex)` cuts into one part. "Redraw geometry" takes all three parts
of a three-part shape, with the list directly above it so what is about to go is on
screen. Making it mean "redraw part 1" would give one button two meanings depending
on part count; removing one part is the list's job.

One Add piece serves all three shapes. Add-part for a Point is one click straight
back to idle; for a Line and a Polygon it is draw-then-Finish. That rhythm
difference is already in the machine. Cut hole appears for areal shapes only.

Add piece is hidden, not disabled, where the record cannot store the result. It is
gated on `allowedTypes.includes('MultiPolygon')`, the same derivation the toggle
already runs, so `notification_registrations` never renders it.

Undo never crosses a part boundary. It pops within the part being drawn and
disables at zero vertices. An Undo that silently reopens a finished part eats
work.

`toDrawGeometry` stops refusing the three `Multi*` types. Its refusal was honest
while the control could not represent parts, and the part list is exactly the
affordance whose absence justified it. `GeometryCollection` keeps returning
`null`.

### Two validity problems, two different answers

A self-intersecting ring is accepted and stored. `validateGeometry` checks
structure and positions only, and there is no self-intersection test anywhere in
the stack, client or server. A bowtie stores today and finding one costs a real
algorithm. That is #437, not this effort.

A hole that escapes its part blocks Finish. This one is nearly free:
`geometryContainsLngLat` (`packages/mapping/src/geometry.ts:136`) is a shipping
runtime point-in-polygon that is already hole-aware and already handles
MultiPolygon. Every vertex of a hole must sit inside its part's outer ring and
outside its other holes; while one does not, Finish is disabled, the draft turns
red, and the toolbar says which part the hole must stay inside.

### Two bugs the prototype found in the model as written

Both are fixed in the prototype's reducer and both carry into the build.

Opening on `allowedTypes[0]` opens every locatable record on Point, so the shape
parts and holes are about is the one you have to switch to. It opens on Polygon
where Polygon is allowed.

`START_HOLE` was reachable for a non-areal part, where the containment check reads
a coordinate pair as a ring and reports "escaped" for every vertex. The reducer
refuses it, rather than leaving the guard to the UI that happens to hide the
button.

## The import path

Two import surfaces, not one, and they take the same answers with one asymmetry.
The bulk region import (`/gis/regions/import`) turns every Feature into a Region
and lets the user rename and delete rows. `GeometryImportDialog` ("Fill from →
File" on record forms) offers the file's shapes and the user adopts exactly one.
Settled in #424.

### One row per Feature

A Feature carrying a MultiPolygon is one record. A FeatureCollection of three
Features is three records. This deletes the `Multi*` arms of `flattenGeometries`
(`:257-265`, `:270-278`) and `flattenPolygons`
(`apps/web/src/routes/gis/regions/-import-parse.ts:55-71`) rather than extending
them, and it deletes the `(1)`, `(2)` part numbering in `importCandidatesFrom`
(`:160-161`), because a group is now a candidate and there is nothing to number.

### The preview row

One flat row per Feature: the name, then a piece count that appears only at two or
more parts, then the vertex count. "Park A · 3 pieces · 214 vertices". No
expansion and no per-part sub-rows, on either surface.

The count earns its place because it names the thing that changed. A file that
used to produce three rows now produces one, and the count is what tells the user
those three lots are still there rather than dissolved. Beyond that, the preview
answers "is this the right file and are these the right records"; the shape
question belongs to the draw control, where the part list already offers hover,
zoom and Remove. A second part list at import time duplicates it at the moment the
user knows least.

Three of the preview's numbers have to be recomputed per Feature, because all
three currently read a multipart geometry as a single-part one:

- `isWgs84Geometry` (`packages/mapping/src/geometry-import.ts:180-185`) branches
  on `type === 'Polygon'` and wraps anything else as one ring. Handed a
  MultiPolygon it destructures a polygon into `lng`, so the comparison is NaN and
  every multipart Feature is silently withheld as projected.
- `importVertexCount` (`:188-194`) reads `coordinates[0]` as the outer ring. On a
  MultiPolygon that is the first polygon, so a three-part park reads "2 vertices".
- `fitMapToItems` (`apps/web/src/routes/gis/regions/import.tsx:546-570`) walks
  `coordinates` as rings, so a multipart item gives NaN bounds,
  `Number.isFinite(west)` is false, and the preview map stops fitting with no
  error.

### No part pruning in the preview

Whole Features only, on both surfaces. Part pruning already exists on the dialog
surface for free: the adopted shape enters the draw controller and the part list
offers Remove before the record is saved.

The bulk region import is the asymmetric one. A bad part there means import, then
open that Region's edit page, then Remove. We wear that. Part-level surgery across
a 400-row preview is a worse tool than the per-Region editor, and a file needing it
should be fixed in GIS.

### Refusals are notes, not row states

`ProjectedCoordinatesNote`
(`apps/web/src/components/map/geometry-import-dialog.tsx:200-210`) is already the
pattern for "we found shapes in your file, we are not offering them, here is why",
and it renders in both the empty and non-empty branches. Every refusal here has
that shape, so the preview grows notes rather than a disabled-row state:

- projected coordinates, which exists on the dialog and which #435 brings to the
  region import
- "1 area has separate pieces and cannot be used here"
- "2 features hold mixed geometry and were skipped"

A Feature of a kind the record never wanted stays absent and generic, as today. A
Feature whose kind matches but whose multipart form this record cannot store gets
the named note. Making it simply absent was the cheaper option and it is the
failure that opened this map wearing a different coat: the user picks a parks
file, Park A is not in the list, and nothing says why.

Exactly one record kind can reach that state under the matrix. The eight
work-record tables take all six shapes. The five Point tables never show the
dialog, because `canImportFile` is false for Point. `regions` takes both Polygon
and MultiPolygon. Only `notification_registrations` can match a base kind and
refuse its multipart form. The note is still worth stating once, because it holds
if the matrix changes and it costs a line beside a component that already exists.

### GeometryCollection is refused and named

`flattenGeometries:279-281` recurses into one and dissolves it. Under one row per
Feature it is refused, and counted separately from the generic skipped total
rather than folded into it.

Taking its first member is the silent drop this whole effort exists to delete.
Continuing to dissolve it contradicts one row per Feature outright.

The blast radius is small. As this slice shipped it was a GeoJSON-only problem:
`KML_GEOMETRY_TAGS` held only `Polygon` and `LineString`, so the common Google
Earth Placemark carrying a label `<Point>` beside its `<Polygon>` yielded just the
polygon. #446 added the `Point` tag, which turned that Placemark into a feature
holding two kinds and refused it as mixed. #473 amends this: one point beside a
shape of one other kind is that shape, the point is dropped as the label it is,
and the row says so and still imports. Several points beside a shape are still
refused, because nothing in the file says which of them is the label. A GeoJSON
GeometryCollection is rare in agency exports. The KML twin exists only because
the gate widened: a `<MultiGeometry>` holding a LineString and a Polygon, on a
record whose `allowedTypes` wants both. Same answer, refused and named.

### The geometryType gate dies

`geometryType: 'Polygon' | 'LineString'` cannot express "Polygon or MultiPolygon",
so it changes either way. It is replaced by `allowedTypes` read from the register.
The dialog then offers exactly what this record can store, and adopting a shape
sets the form's type toggle.

Keeping the two values and reinterpreting them as a base kind was the alternative.
It fails: it offers a MultiPolygon to a `notification_registrations` row, which
takes Point and Polygon only. Fixing that needs a storability filter, and that
filter is `allowedTypes`, so the base-kind reading is the register read twice.

`canImportFile` follows. It becomes "`allowedTypes` holds a kind the parser can
produce" rather than the current
`geometryType === 'Polygon' || geometryType === 'LineString'`.

### The parser stays at areas and lines, then does not

`allowedTypes` is the gate, but the parser caps what can reach it. As this slice
shipped, `flattenGeometries` had no Point arm and `KML_GEOMETRY_TAGS` held only
`Polygon` and `LineString`, so Point and MultiPoint Features stayed in the generic
skipped count. The hole was invisible while `canImportFile` was false for Point,
and became visible once the gate was `allowedTypes`, which admits Point and
MultiPoint on the eight work-record tables.

It was stated out loud rather than fixed, because "the gate is `allowedTypes`"
and "you cannot import a point" are both true and read as a contradiction
otherwise. Point import was a capability that had never existed and no part of it
is a multipart problem, so it was filed as #446 and built there. The parser now
reads all six shapes, `isImportGeometryKind` drops nothing the register names, and
the five Point-only records offer the file import like every other one.

### The caps count Features

`MAX_POLYGONS = 1000` and `MAX_CANDIDATES = 500` count geometries today; they
become per-Feature. A 400-Feature file averaging three parts goes from truncating
at 333 Features to importing all 400. The numbers stay where they are: the cap
bounds writes, the write count is now the Feature count, so the same number buys
more file.

No per-Feature part cap. Nothing caps the part count in the draw control, and a
cap here would be the only one in the stack. The residual risk is one pathological
Feature with tens of thousands of parts becoming a single enormous geometry, which
is a payload-size question rather than a preview one.

### The dialog's noun

The copy is noun-locked today: "Import a Polygon", "Use This Polygon", "holds no
polygons", `fallbackName` of `'Polygon'` or `'Line'`. Once one dialog can offer
areas and lines together, the noun has nowhere to come from.

Keep the specific noun when `allowedTypes` resolves to one base kind, so a Region
import still reads "Import a Polygon", and fall back only when it does not. The
general word is Geometry, not "Shape": it is what `GeometryControl` is already
labelled and what the register's `domainName` values say ("Habitat Geometry").
"Shape" would be a second name for a concept the codebase has named once.

### A consequence that is not backfilled

An agency that already imported a three-lot park file holds three Regions named
"Park A (1)", "Park A (2)", "Park A (3)". Re-importing the same file now produces
one Region named "Park A". Nothing reconciles the two. This belongs in the release
note for the import slice.

## The static gate

### check:geometry-policies

Three structural assertions, pure TypeScript, no database:

1. Every `OwnedGeometryKind` has exactly one policy row.
2. No table name appears on two rows.
3. No file outside `packages/domain/src/shared.ts` writes a geometry-type
   string-literal list.

Exempt from 3: generated files, `dist`, and test fixtures that spell out a list as
input data. Those three categories and no per-file escape hatches. A file that
wants an exemption is a file that wants a copy.

Gated at zero, no allowance list. `check:acknowledgements` ratchets because it
inherited 73 unchecked names; this matrix has no backlog, since the seven copies
currently agree.

### The DB half is a test, not a static gate

Reading the CHECKs statically means folding `add constraint`, `drop constraint`
and `alter column type` across migration files in order, which is a small SQL
interpreter. The repo already paid for parsing migration text in #123, and
`packages/db/schema.sql` is not committed, so there is no DDL artifact to read.

So the DB half is one case in
`packages/db/src/tests/integration/owned-geometry.integration.test.ts`, iterating
`OWNED_GEOMETRY_POLICIES` and reading both halves of the DDL from the catalog:
the typmod from `postgis_typmod_type`, the accepted set from
`pg_get_constraintdef`. Their intersection is the storable set and it must equal
`allowedTypes`. It asserts the reverse too, that every table with a `geom` column
is named by exactly one policy row, which is what catches a sixteenth geometry
table added with no registration. Iterating means a new kind needs no test edit.
`packages/db` depends on `@simmer-mosquito/domain` in production, so the test can
read the register.

### Never read geometry_columns

PostGIS's `geometry_columns` view is the obvious catalog source for "what shape
does this column accept" and it gives the wrong answer for nine of the fifteen
tables today, before any multipart work lands. It computes `type` as

```sql
COALESCE(NULLIF(upper(postgis_typmod_type(a.atttypmod)), 'GEOMETRY'), st.type, 'GEOMETRY')
```

where `st.type` is `replace(split_part(s.consrc, '''', 2), ')', '')` over any
constraint whose definition matches `%geometrytype(% = %`. A generic typmod nulls
out the first arm and the view falls back to the CHECK, where `split_part` takes
the first quoted literal and stops. `pg_get_constraintdef` renders `in (...)` as
`= ANY (ARRAY[...])`, which matches the pattern, so all nine
`geometry(Geometry,4326)` tables report `POINT`.

After the regions migration it gets worse: `regions` reads `POLYGON` for a column
holding MultiPolygons. Writing the CHECK as
`st_geometrytype(geom) in ('ST_Polygon', 'ST_MultiPolygon')` is worse still,
because the substring match fires anyway and the view reports `ST_Polygon`, which
is not a PostGIS type name at all. The explicit two-name list stays as it is:
nothing in SIMMER reads `geometry_columns`, the nine tables already carry the same
misreport, and the tools that do read it are external (QGIS, `ogr2ogr`,
`Populate_Geometry_Columns`).

Read this instead:

```sql
select r.relname, format_type(a.atttypid, a.atttypmod), postgis_typmod_type(a.atttypmod)
from pg_attribute a
join pg_class r on r.oid = a.attrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public' and a.attname = 'geom' and not a.attisdropped and r.relkind = 'r';
```

Pair it with `pg_get_constraintdef` for the accepted set.

## Build order

Six slices. The ordering is forced in three places, named below.

### 1. The collapse

`OWNED_GEOMETRY_POLICIES` becomes the register and gains `tables`. The four
duplicate copies are deleted, `check:geometry-policies` lands, and the
catalog-reading case lands in `owned-geometry.integration.test.ts`. Against
today's matrix, so no behaviour changes and both go green on the current values.

### 2. Domain types and the covers-ground rule

Six literals, six interfaces, one exhaustive `switch` in `validateGeometry`,
`isSupportedGeometryType` over six, the three Multi validators as maps over the
existing three. Demote in the builder with the demote table as its unit test. The
covers-ground predicate and its three call sites. The three copies of
`geojsonToGeom` collapse to one. `fallbackLocationSource` loses its parameter. The
two client gates in `use-map-draw.ts` call the predicate.

Depends on slice 1, because the normalizers and `validate*LocationSource` read the
register, and because both slices edit `location-intent.ts`. Depends on #436,
which makes a `DomainValidationError` from inside the transaction a 400 rather
than a 500.

Multi is not storable yet: `allowedTypes` still lists three shapes, so the domain
union can widen ahead of the migration without anything reaching a CHECK that
would refuse it.

### 3. The migration slice

The nine CHECK swaps, the `regions` rewrite with its new CHECK and its refusing
down, the `notification_registrations` narrowing, the widened `allowedTypes` in
the register, the membership predicate widened to two areal names with its
snapshot move, the corpus from 22 to 32, the area-weighted
`ownedCentroidFromGeoJson` with its integration test, and the `isPointGeomType`
docstring.

These cannot be separate PRs. `check:geometry-policies` is at zero with no
allowance, so the day a CHECK widens the register must already say so. And the
corpus seeds into `habitats` and `regions`, so its SQL half fails on the insert
rather than on the predicate if it lands first.

Watch an Electric shape across the migration rather than assuming. The measurement
says the rewrite carries nothing and the relation OID is unchanged; nobody has
driven a running Electric through it.

### 4. Draw control: parts

The part model in the controller, `startPart`, promote and demote as parts change,
the part list with hover, zoom and Remove, the 8-row window with "Show all N", the
hidden Add piece, `toDrawGeometry` widened, and the two prototype fixes (open on
Polygon where allowed, refuse `START_HOLE` on a non-areal part).

Depends on slice 3, because Add piece is gated on `allowedTypes` holding the multi
form and nothing holds it until the migration lands.

### 5. Draw control: holes

`startHole(partIndex)`, the per-row action, the containment check against
`geometryContainsLngLat`, the refused Finish with the part named, the nested hole
rows, and `geometryFromVertices` building more than one ring.

Depends on slice 4. Same file, and the per-row action needs the rows.

### 6. The import path

One row per Feature, the `Multi*` arms and the part numbering deleted, the
`allowedTypes` gate replacing `geometryType`, `canImportFile` rewritten,
GeometryCollection refused and counted, the three recomputed preview numbers, the
piece count in the row, the two new notes, the caps counting Features, the noun
rule, and `normalizeRings` losing its `closed.length >= 4` check.

Depends on slice 3 for the widened `allowedTypes` and on slice 4, because an
adopted MultiPolygon enters the draw controller. #435 lands ahead, so both
surfaces already agree on the WGS84 note before the two new ones are added.

Slices 3, 4, 5 and 6 change what a user can do, so each carries a changeset.
Slices 1 and 2 are a refactor and a validation rule with no surface of their own.

## Land-ahead issues

Four bugs, all independent of every multipart decision, all filed while the map
was being worked. Holding any of them inside a slice would make its readers
tolerate two answers until that slice ships.

- #433, Address writes the GeoJSON-cased `geom_type` into the optimistic row.
  Before slice 3.
- #435, the bulk region import offers projected coordinates and fails every write.
  Before slice 6.
- #436, a domain refusal raised inside the write transaction answers 500. Before
  slice 2, which is the slice that starts raising one from inside.
- #437, 15 production Regions hold self-intersecting rings and membership on them
  is undefined. Not a blocker. It is here because the corpus deliberately excludes
  invalid geometry and somebody will ask why.

## Out of scope

Ruled out on the map, each with the ticket that ruled it.

- Editing a drawn shape vertex by vertex. Dragging a vertex, inserting one
  mid-edge, deleting one. The control has never been able to do it and no issue
  tracked it: a 40-vertex Polygon is redraw-or-nothing today. That is not a
  multipart gap, and the part list makes the multipart case better than the single
  one, because Remove plus Add piece redraws one part without touching the others.
  Tracked in #449. "Continue a part", the cheap partial where a part re-enters
  draw mode with its vertices preloaded, went out with it here and was built
  afterwards under #445, so a shape that stopped one vertex early is no longer
  redraw-or-nothing. The three gestures themselves were built afterwards too,
  under #495, over an edit draft seeded with every ring of one part. Reshape
  followed under #496 and previews into that same draft: a line sketched across a
  part's outline replaces the stretch between its first and last crossing, so one
  gesture extends where it runs outside and carves where it runs inside. Split
  closed the set under #497, over the same draft and the same crossings: a line
  run in one side of a part and out the other cuts it in two, and both pieces go
  back at the index the one they replace held. It is the only one of the three
  that changes how many parts a shape has, so it is the only one with a refusal
  read off `OWNED_GEOMETRY_POLICIES`: a Notification Registration stores a Point
  or a Polygon and neither multi shape, so the second piece has nowhere to go.
  The two pieces share the line they were cut along, which OGC calls an invalid
  MultiPolygon and nothing in this schema refuses. #518 carries that.
- Importing a point from a file. No import surface has ever produced a Point, and
  adding one is a new capability with no multipart in it.
- GeometryCollection as a record geometry. Nothing in mosquito control needs a
  point and a polygon in one record, and it would force a "what is this even"
  branch into every consumer.
- Widening every geometry column to `geometry(Geometry,4326)`. Five more table
  rewrites, and it drops a constraint that is catching real data-entry errors.
- Swapping the stored centroid to `ST_PointOnSurface`. It is the better answer to
  a question nobody asked. `ST_Centroid` can land outside a C-shaped or multipart
  region and `ST_PointOnSurface` is guaranteed to land inside one, but changing it
  rewrites `lat` and `lng` for every existing row on all 15 tables, which is a
  migration in disguise. Written down so the next person who finds a marker
  outside its region reads this instead of rediscovering it.
- Geometry validity. A ring that crosses itself stores and SIMMER tests for it
  nowhere. See #437.
- Mobile's TypeScript implementation of region membership. The corpus it must pass
  grows here; the implementation does not.
- Backfilling existing rows. No row changes type.

## Glossary

Two terms go into `CONTEXT.md` with this effort.

A **Part** is one of the pieces of a multipart geometry. A record with two or more
parts stores a Multi shape; one part stores the base shape. Part order carries no
meaning.

A geometry **covers no ground** when it encloses zero area or spans zero length.
It is distinct from invalid, which is about a ring crossing itself and which
SIMMER does not police.
