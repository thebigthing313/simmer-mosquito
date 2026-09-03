# 18. A record's geometry may have several parts, and it promotes in place

Date: 2026-09-03

## Status

Accepted. Amends ADR 0015, which assumed multipart geometry could not occur and
said so in its own Decision text. `docs/multipart-geometry-spec.md` is what gets
built.

## Context

SIMMER stores three geometry shapes: Point, LineString, Polygon. Nine tables are
`geometry(Geometry,4326)` held to those three by a CHECK, five are typed Point by
their column modifier, and `regions` is typed Polygon.

Two things agencies do have no representation under that.

A Region can genuinely be disjoint. A county parks file where "Park A" is one park
on three separated lots imports as three Regions today, because the import splits
per geometry rather than per Feature. It does not refuse the MultiPolygon, it
dissolves it and says nothing, so the user finds out when a report counts three
parks.

An Application's treated area can be disjoint too, in polygon or line form,
because a crew split the work for traffic or access. Recorded as one polygon
drawn around everything, a pesticide record claims coverage of ground nobody
treated.

Polygon holes are a separate gap with a separate cause. `normalizeRings` already
keeps interior rings, so a Polygon with a hole imports and stores today. Only the
draw control cannot make one: `geometryFromVertices` always builds exactly one
ring.

## Decision

**Six shapes.** Point, LineString, Polygon, MultiPoint, MultiLineString,
MultiPolygon, as a flat union of six GeoJSON literals in `packages/domain`. No
parts wrapper and no base-type-plus-multiplicity pair, because GeoJSON is what
crosses every seam in this stack and a wrapper pays a conversion at each of them.

**A record promotes in place.** Adding a second part turns a Polygon into a
MultiPolygon on the same row and the same id, and removing it demotes back. A
one-part MultiPolygon never exists. Demote runs in the domain builder, in
`validateGeometry`, silently and nowhere else: `ogr2ogr` emits a one-part
MultiPolygon for every single-lot feature in a shapefile, so demote is the common
import path rather than a defensive corner. A one-part Multi is a tool artifact,
not a user error, so it is normalized rather than refused.

**Not every record accepts every shape.** The five Point tables stay Point,
because a Trap is one device and a Service Request is one place, and the typmod is
what catches the typo. `regions` takes Polygon and MultiPolygon.
`notification_registrations` narrows to Point and Polygon, because two places are
two subscriptions. The eight work-record tables take all six, including MultiPoint,
which catch-basin larviciding needs: a set of separated basins recorded as a
polygon around the block claims treatment of everything between them.

**One register holds that matrix.** `OWNED_GEOMETRY_POLICIES` is promoted from
decoration to the single source, keyed by the 12 owned-geometry kinds and naming
the 15 tables they cover. The matrix was written in seven places and nothing held
them to each other; four of the seven are deleted rather than checked, and
`check:geometry-policies` gates what is left at zero. A framework-agnostic package
knowing table names is the price of one register instead of seven copies.

**Existing rows are never rewritten.** No backfill, in either direction. A Region
that is a Polygon today is a Polygon tomorrow, and the `regions` down-migration
refuses rather than splitting a multipart Region into rows nobody named.

**A stored geometry must cover ground.** Positive length for a line, positive area
for a polygon net of its holes, Point exempt, strictly greater than zero with no
epsilon. One predicate in `packages/domain`, called from `validateGeometry`, from
the inherited-geometry path, and from `geojsonToGeom` as the backstop. A Multi
with one degenerate part rejects the whole write naming the part, and never drops
the part: dropping throws away something the user drew and then cascades into a
demote.

Validity is a different rule and stays unpoliced. 15 of 345 production Regions
hold self-intersecting rings, so an `ST_IsValid` gate would refuse live rows on
their next save. That is #437.

**Import is one row per Feature.** A Feature carrying a MultiPolygon is one
record; a FeatureCollection of three Features is three records. A
GeometryCollection is refused and named rather than dissolved, because taking its
first member is the silent drop this decision exists to delete.

**The draw control never says Multi.** The type toggle stays Point, Line, Polygon,
and the shape promotes when the user adds a piece. A part list replaces the summary
line at two parts and only at two. A hole is cut into a part the user names first,
so nothing is hit-tested to guess which part was meant.

## Consequences

- Region membership changes answer for multipart records.
  `map-region-filter.ts:95` branches on `geom_type = 'st_polygon'` alone, so a
  MultiPolygon falls to plain intersection today and a boundary touch counts as
  inside. Widening the branch is a correctness fix, not a new rule; the amendment
  on ADR 0015 has it.
- `regions.geom` costs a table rewrite under `AccessExclusiveLock`. Measured at
  production size: 26 ms, 494 KB of WAL, and zero bytes on the replication stream,
  because the reorder buffer drops changes on a rewrite heap before the output
  plugin sees them. It is safe beside a live Electric slot.
- The `regions` down-migration is the only one in the set that can refuse. It
  refuses once any row holds a MultiPolygon, soft-deleted rows included, and names
  the rows in the message because dbmate drops `detail` and `hint`.
- `geom_type` starts returning `st_multipolygon` to clients. `normalizeGeomType`
  already absorbs that and the Mapbox layer filters already match a MultiPolygon
  under `['geometry-type']`, so display and rendering need nothing. Only the
  membership predicate and the corpus oracle read the raw value.
- An agency that already imported a three-lot park file holds three Regions. Under
  one row per Feature the same file now produces one, and nothing reconciles the
  two.
- `packages/domain` and `packages/mapping` now hold structurally identical
  six-member unions. `fallow dupes` will see them. Merging them would be the first
  production edge into `packages/mapping` and would put the geometry primitives
  under the domain types, so the copy stays.
- Mobile's region-membership corpus grows to 32 cases before mobile implements it.
  The gate rises ahead of the implementation.
