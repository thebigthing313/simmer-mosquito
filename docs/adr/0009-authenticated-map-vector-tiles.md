# ADR 0009: Authenticated map vector tiles for open-ended map browsing

Status: Accepted

Date: 2026-05-28

## Context

SIMMER stores owned geometry directly on locatable operational rows such as
habitats, traps, inspections, service requests, control actions, regions, and
mission items. Electric/TanStack DB remains the normal read path for row data,
but several map index pages need to browse spatial catalogs whose size can grow
well beyond what a client should hydrate as records and convert into GeoJSON.

For example, an agency may catalog tens of thousands of larval habitats. A
viewport bounding-box query can still cover the whole agency when the map is
zoomed out, so a client-generated GeoJSON layer from full synced habitat rows
would make zoom level and pan position control memory, transfer, and rendering
costs unpredictably.

At the same time, not every map needs tiled rendering. Route, mission,
assignment, and record-detail maps usually display a bounded object context:
the selected route stops, mission items, or one record's related geometry.

## Decision

Use authenticated Mapbox Vector Tile (MVT) endpoints for open-ended spatial
browsing maps. Keep bounded object-context maps on explicit GeoJSON or ordinary
record-detail data.

`apps/server` owns the tile API. Tile requests are authorized with the normal
server `AuthContext`; clients do not pass tenant scope. Tile SQL must apply the
selected organization, deleted-row predicates, spatial tile bounds, and any
structured filters server-side.

The initial route is:

```text
GET /map/tiles/:tileset/:z/:x/:y.mvt
```

The first implemented tileset is `habitats`. Future tilesets should be added as
workflow map products, not as a separate tile server for every database table.
A tileset may contain multiple MVT source layers when a workflow commonly views
several feature classes together.

Tile filters are allowed only through structured, whitelisted query
parameters. The server parses and validates those parameters, then builds
parameterized SQL. Clients must not send raw SQL fragments or ad hoc predicate
languages to tile endpoints.

Tile feature properties should be small render and interaction hints, such as
ids, type ids, active state, inaccessible state, geometry type, and short label
fields. Full records, metadata, audit fields, and custom field payloads remain
in Electric/TanStack DB collections or detail APIs.

Bounded object-context maps should continue to use GeoJSON when that gives a
clearer interaction model. Examples include route detail, mission detail,
assignment stops, and selected record maps. Those screens may offer optional
MVT context overlays, such as nearby habitats or traps, but those overlays
should default off unless the workflow proves otherwise.

## Consequences

- Index/catalog maps can browse large spatial datasets without hydrating the
  full organization rowset into frontend collections.
- Server-side PostGIS tile queries become a specialized read path alongside
  Electric sync, not a replacement for synced row data.
- Tile cache keys include filters, so filter params should stay canonical,
  small, and purposeful.
- Feature click/detail flows need a second read path: tile feature id first,
  then synced row or detail query for full data.
- Map layer additions should be registered in shared tile infrastructure rather
  than copied as unrelated endpoints.
- Aggregate or clustered tile layers can be added later for low zoom levels
  without changing the client contract for high-zoom raw features.
- Route and mission maps stay focused on their bounded operational dataset,
  while optional MVT overlays can provide nearby context without making the
  task dataset itself tiled.

## Later refinement (2026-07-07): centroid columns may sync

The original decision left all owned-geometry projection columns off the sync
path. This is narrowed: the trigger-maintained centroid columns (`lat`, `lng`,
`geom_type`) on the locatable tables **may** be streamed through Electric so
pin/list/coordinate reads come straight off the synced row, collapsing the
"synced row + separate coordinate fetch" dual path for those surfaces.

Full geometry stays on the specialized read path unchanged: the raw `geom` and
the generated `geojson` are **never** streamed (Postgres logical replication does
not publish `GENERATED` columns, and geojson is unbounded). `packages/sync`
enforces this: its descriptor factory forbids `geom` and `geojson` in any shape
descriptor while allowing the centroid columns. Open-ended catalog maps still use
MVT tiles (the row-count ceiling, not coordinate availability, is what forces
tiling), and bounded polygon-detail maps still fetch geojson from `/map/*`.

See the `202607070001_sync_owned_centroid_columns` migration, which converts the
centroid columns from `GENERATED ALWAYS AS … STORED` to plain columns maintained
by the shared `set_owned_centroid()` trigger across all 15 locatable tables.
