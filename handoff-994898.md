# Handoff: Plan Migration Away From `spatial_features`

## Next Session Goal

Generate a concrete migration plan for replacing the central `spatial_features`
registry with geometry stored directly on the domain tables that own location or
shape. The user wants a plan, not immediate implementation.

## Suggested Skills

- `zoom-out`: useful to review how this architectural shift fits the broader
  domain model and Electric/TanStack DB sync policy.
- `improve-codebase-architecture`: useful if turning this into ADR/doc updates
  and a staged refactor plan.
- `tdd`: useful later when implementing command/schema changes, but probably not
  needed for the planning-only session.

## Conversation Context

We discussed whether ElectricSQL's table-shaped sync model makes the central
`spatial_features` table less attractive. The emerging decision:

- Geometry in SIMMER is almost always in service of a domain entity, not a GIS
  asset managed independently.
- Most UI/workflows care about "habitat geometry", "trap location", "mission
  item target", "service request point", or "region boundary", not "spatial
  feature".
- Electric/TanStack DB sync favors rows that are self-contained and tenant
  scoped. `spatial_features` is generic and not org-scoped, which complicates
  shape authorization, dependency loading, offline persistence, and local joins.
- Deduplication is unlikely to save meaningful storage for normal operational
  geometries, especially points and modest lines/polygons. The complexity cost is
  larger than the storage benefit.
- Spatial intersection caches do not require a geometry registry. They can be
  keyed by domain identity, e.g. `region_id`, `entity_type`, `entity_id`, or by
  typed cache tables such as `habitat_region_intersections`.

## Planning Constraint From User

The database side should be planned as two separate migration stages:

1. Add direct geometry columns to all geometry-bearing tables and backfill from
   `spatial_features`.
2. In a later migration, drop `feature_id` usage and then drop
   `spatial_features` and its helper functions/tables once application code and
   docs no longer depend on it.

Do not collapse these into one risky migration.

## Likely Affected Schema Areas

Current migration references show `feature_id` on:

- Foundation:
  - `addresses`
  - `regions`
  - `spatial_feature_regions` cache table
- Adult surveillance:
  - `traps`
  - `collections`
- Larval surveillance:
  - `habitats`
  - `inspections`
- Control operations:
  - `applications`
  - `source_reductions`
  - `outreach_actions`
  - `biocontrol_actions`
  - `requested_control_actions`
  - `mission_items`
- Public engagement:
  - `service_requests`
  - `notification_registrations`
- Weather:
  - `weather_sources`

Use `rg -n "feature_id uuid|feature_id\\b|spatial_features|spatial_feature_regions" packages/db/migrations docs -S`
to refresh the list.

## Current Files To Review

- `packages/db/migrations/202605060002_spatial_taxonomy_foundation.sql`
  defines `spatial_features`, `get_or_create_spatial_feature`, `addresses`,
  `regions`, and `spatial_feature_regions`.
- `packages/db/migrations/202605220001_batch_spatial_features.sql`
  defines batch helper `get_or_create_spatial_features`.
- `packages/db/migrations/202605060003_adult_surveillance.sql`
- `packages/db/migrations/202605060004_larval_surveillance.sql`
- `packages/db/migrations/202605060005_control_operations.sql`
- `packages/db/migrations/202605060007_contacts_service_requests.sql`
- `packages/db/migrations/202605060008_notifications.sql`
- `packages/db/migrations/202605060009_weather.sql`
- `packages/db/migrations/202605260002_tenant_scope_child_rows.sql`
  added `organization_id` to `spatial_feature_regions`.

Docs with stale `feature_id`/`spatial_features` language likely need updates:

- `docs/architecture.md`
- `docs/sync.md`
- `docs/foundation-domain.md`
- `docs/adult-surveillance-domain.md`
- `docs/larval-surveillance-domain.md`
- `docs/control-operations-domain.md`
- `docs/public-engagement-domain.md`
- `docs/mission-dispatch-domain.md`
- `docs/weather-domain.md`
- `docs/domain-command-contract.md`
- `docs/field-work-support-domain.md`
- `docs/adr/0007-shared-sync-descriptors-per-frontend-collections.md`

## Planning Questions To Resolve

- Standard direct geometry column shape:
  - likely `geom geometry(Geometry, 4326) not null`;
  - generated `geojson jsonb`;
  - generated `geom_type text`;
  - generated `lat`/`lng` where point/centroid display is useful;
  - optional `geom_hash` if dedupe/debugging is still useful.
- Whether to use generic `geometry(Geometry, 4326)` everywhere with domain
  checks, or type-specific columns such as `geometry(Point, 4326)` for point-only
  tables.
- Which generated columns should be synced through Electric vs left server-only.
- Whether `regions` should simply become `regions.geom`, or retain any special
  GIS-layer behavior.
- Replacement for `spatial_feature_regions`:
  - generic domain-keyed table: `region_id`, `entity_type`, `entity_id`;
  - or typed tables per entity family;
  - or defer until a concrete reporting/GIS screen needs it.
- How to preserve command semantics:
  - commands continue accepting domain `locationSource`, never raw geometry DB
    ids;
  - when source is another locatable record, copy that source row's current
    `geom` into the target row inside the transaction;
  - when source is explicit GeoJSON, validate/normalize directly into target
    row `geom`.
- How to stage application code while both `feature_id` and direct `geom` exist.

## Suggested Plan Shape

1. Write/update an ADR documenting the shift:
   "Operational geometry is stored on the owning domain row; central spatial
   feature registry is retired."
2. Produce a table-by-table migration matrix:
   table, allowed geometry types, direct columns, generated columns, indexes,
   backfill expression, command handlers affected, sync descriptors affected.
3. Stage 1 DB migration:
   add direct geometry/generated columns, backfill with joins to
   `spatial_features`, add indexes/checks, keep `feature_id` and registry in
   place.
4. Stage 1 app/server changes:
   read/write direct geometry while preserving compatibility with existing
   `feature_id`; update sync descriptors to expose row-owned geometry.
5. Stage 1 verification:
   integration tests prove backfilled geometry equals prior feature geometry;
   command tests prove explicit and copied-source geometry writes direct columns.
6. Stage 2 DB migration:
   drop `feature_id` FKs/indexes, drop `spatial_feature_regions` or replace it,
   drop helper functions, then drop `spatial_features`.
7. Stage 2 docs cleanup:
   remove language saying server maps geometry to `spatial_features.id` or
   snapshots `feature_id`; replace with direct-copy/direct-normalize language.

## Important Tone/Intent

The user appears convinced that `spatial_features` no longer has enough value.
Do not argue to preserve it abstractly. Treat the next work as making a safe,
staged, reversible-enough migration plan and identifying any concrete places
where a central registry still has a real product-backed use.
