# Handoff: MVT Tile Server Infrastructure

## Focus

Build the API endpoint and shared infrastructure for serving authenticated Mapbox Vector Tiles (MVT) from `apps/server`, initially for habitat browsing, with a structure that can later support other geometry-bearing workflow tilesets.

This handoff is for implementation, not frontend design. The habitats index page design can consume this later.

## Repo Context

- Workspace: `F:\simmer-mosquito`
- Server: `apps/server`, Hono app in `apps/server/src/main.ts`
- Database package: `packages/db`
- Spatial source of truth: owned `geom` columns on domain tables, not shared `spatial_features`.
- Relevant migration: `packages/db/migrations/202605270001_owned_geometry_columns.sql`
  - `habitats.geom geometry(Geometry, 4326)`
  - generated `lat`, `lng`, `geojson`, `geom_type`
  - `habitats_geom_gist_idx on habitats using gist (geom) where deleted_at is null`
  - habitats geometry constrained to `POINT`, `LINESTRING`, `POLYGON`
- Current web sync descriptor: `packages/sync/src/index.ts`
  - `habitatsSyncDescriptor` is on-demand and includes full-ish row fields plus `geojson`.
- Current habitats route: `apps/web/src/routes/habitats.tsx`
  - stub page only.
- Auth model: server-side authorization. Use `authContextMiddleware`; derive organization from `context.get('authContext')`.

## Product Decisions From Conversation

- MVT is for open-ended spatial browsing/index pages where result cardinality may be huge:
  - habitats, inspections, traps, service requests, applications/control work, field overview maps.
- GeoJSON remains appropriate for bounded object-context maps:
  - route detail, mission detail, assignment stops, selected record geometry.
- Bounded pages may optionally overlay MVT context layers, but default them off.
- Tilesets should represent map use cases/workflows, not one tile server per table.
- One tile-serving module should support multiple tilesets and multiple source layers per tile response.
- Filters are passed as structured query params and translated through a whitelist/registry into parameterized SQL.
- Do not accept raw SQL-ish filter expressions from clients.
- Tiles contain small render/click properties only. Full detail stays in synced rows or detail APIs.

## Recommended API Shape

Start with:

```text
GET /map/tiles/:tileset/:z/:x/:y.mvt
```

Initial supported tileset:

```text
habitats
```

Example:

```text
GET /map/tiles/habitats/13/1310/3166.mvt?isActive=true&habitatTypeId=...
```

Server behavior:

- Apply `authContextMiddleware`.
- Scope every query to `authContext.organization.id`.
- Validate `tileset`, `z`, `x`, `y`.
- Parse allowed filters only.
- Return `application/vnd.mapbox-vector-tile`.
- Return an empty MVT tile for valid requests with no features.
- Return `400` for invalid tile coordinates, unknown tilesets, or invalid filters.

## Initial Habitat Tile Semantics

For the MVP, implement raw habitat features at higher zooms and leave a clear extension point for aggregate/cluster layers.

Suggested source layer names:

```text
habitats
```

or, if splitting now is easy:

```text
habitat_points
habitat_lines
habitat_polygons
```

Feature properties should be small:

```text
id
habitatName
habitatTypeId
isActive
isInaccessible
geomType
```

Avoid:

```text
metadata
description
audit fields
full GeoJSON
large custom fields
```

## SQL Shape

Core PostGIS query pattern:

```sql
with
bounds as (
  select st_tileenvelope($1, $2, $3) as geom_3857
),
tile_rows as (
  select
    h.id,
    h.habitat_name as "habitatName",
    h.habitat_type_id as "habitatTypeId",
    h.is_active as "isActive",
    h.is_inaccessible as "isInaccessible",
    h.geom_type as "geomType",
    st_asmvtgeom(
      st_transform(h.geom, 3857),
      bounds.geom_3857,
      extent => 4096,
      buffer => 64
    ) as geom
  from habitats h
  cross join bounds
  where h.organization_id = $4
    and h.deleted_at is null
    and h.geom && st_transform(bounds.geom_3857, 4326)
    and st_intersects(h.geom, st_transform(bounds.geom_3857, 4326))
)
select st_asmvt(tile_rows, 'habitats', 4096, 'geom') as tile
from tile_rows;
```

Use parameterized SQL through Kysely/sql helpers. Do not string-concatenate user filter values.

## Filter Registry

Implement a small tileset/filter registry rather than route-local conditionals.

Suggested shape:

```ts
type ParsedTileFilter = unknown;

type TileFilterDefinition = {
  readonly param: string;
  readonly parse: (values: readonly string[]) => ParsedTileFilter;
  readonly apply: (input: {
    readonly filter: ParsedTileFilter;
    readonly alias: string;
  }) => unknown;
};
```

Initial habitat filters:

- `isActive=true|false`
- `isInaccessible=true|false`
- `habitatTypeId=<uuid>` or comma-separated UUIDs

Canonicalization/caching can come later, but parse behavior should be deterministic.

## Suggested Files

Likely additions:

- `apps/server/src/map-tiles.ts`
  - route registration, tile coordinate parsing, content type handling.
- `apps/server/src/map-tiles.test.ts`
  - unit tests around route validation/filter parsing and mocked DB responses.
- Possibly `packages/db/src` additions:
  - exported helper like `getHabitatMvtTile(db, input)` if keeping SQL in db package matches existing patterns.

Register routes from `apps/server/src/main.ts` similarly to existing route modules.

Also add CORS for `/map/*` in `apps/server/src/main.ts`, probably `GET` and `OPTIONS`, matching authenticated sync reads.

## Testing Expectations

Add focused tests before broad integration:

- Valid habitat tile route calls DB with selected org id.
- Invalid `z/x/y` returns 400.
- Unknown tileset returns 400 or 404 consistently.
- Invalid boolean filter returns 400.
- Invalid UUID filter returns 400.
- Empty tile response still uses MVT content type.
- Route is auth-protected.

If DB integration test support is practical, add one PostGIS-backed test that inserts habitats in and out of a known tile and verifies returned tile bytes are non-empty. Do not overbuild decoding unless an MVT decoder is already available.

## Follow-Up Work Explicitly Out Of Scope

- Habitats index UI redesign.
- Mapbox/MapLibre dependency selection in `apps/web`.
- Cluster/grid aggregate tiles.
- Tile caching headers and CDN strategy.
- Overlay UI persistence.
- Replacing bounded route/mission GeoJSON maps.

## Skills Suggested For Next Agent

- Use repo AGENTS instructions first: run `pnpm.cmd dlx @tanstack/intent@latest list` from workspace root before substantial work.
- Use `zoom-out` only if the agent needs broader domain/module orientation.
- Use `diagnose` if PostGIS/MVT SQL behavior is failing or performance is unclear.

## Acceptance Criteria

- `apps/server` exposes an authenticated MVT endpoint for the `habitats` tileset.
- Habitat tiles are org-scoped, deleted-row filtered, spatially bounded by tile, and return binary MVT.
- Filter params are whitelisted, validated, and parameterized.
- Infrastructure is not hard-coded in a way that prevents adding traps/service requests/control-work tilesets later.
- Tests cover route validation and filter behavior.
