# Handoff: Mapping Package and Web Map Infrastructure

## Context

The architecture decision for map data loading is now documented in
`docs/adr/0009-authenticated-map-vector-tiles.md` and cross-referenced from
`docs/architecture.md`.

Commit containing that documentation:

```text
b5abae4 Document map vector tile architecture
```

Peirce previously implemented the first server-side MVT endpoint for habitats:

- `apps/server/src/map-tiles.ts`
- `apps/server/src/map-tiles.test.ts`
- `packages/db/src/index.ts#getHabitatMvtTile`

That endpoint is intentionally habitat-only for now. Future layers and
tilesets can be added later.

## Product/Architecture Rules

- Use MVT for open-ended browsing/index maps where result size can grow
  without a natural ceiling.
- Use GeoJSON or ordinary detail data for bounded object-context maps such as
  route detail, mission detail, assignment stops, and selected record maps.
- Bounded maps may offer optional MVT context overlays, but those overlays
  should default off.
- Map tile requests are authenticated and org-scoped on the server.
- Client map code should treat tiles as render/click hints, not full record
  data.

## Existing Reference To Inspect

There is an older package in the adjacent repo:

```text
F:\simmer\packages\mapping
```

Useful ideas there:

- platform-neutral map types
- map viewport/store concepts
- geometry helpers
- browser geolocation hook
- location session ideas

Do not copy it verbatim. Adapt and clean it up for this repo:

- package name should be `@simmer-mosquito/mapping`
- this repo has owned geometry on domain rows, not shared `spatial_features`
  as the central model
- this repo has the new MVT/GeoJSON split from ADR 0009
- keep APIs small and inspectable

## Worker 1: `packages/mapping`

Ownership:

- `packages/mapping/**`
- root `tsconfig.json` references if needed
- only the minimal package/workspace metadata needed for this package

Goal:

Create a new shared mapping package for provider-neutral geometry, viewport,
feature reference, tile source, overlay, and small helper logic. Keep it mostly
framework-neutral unless a React hook is clearly shared and belongs outside the
web app.

Suggested package shape:

```text
packages/mapping/package.json
packages/mapping/tsconfig.json
packages/mapping/src/index.ts
packages/mapping/src/geometry.ts
packages/mapping/src/viewport.ts
packages/mapping/src/features.ts
packages/mapping/src/tiles.ts
packages/mapping/src/overlays.ts
packages/mapping/src/*.test.ts
```

Likely exports:

- `LngLat`
- `BoundingBox`
- `MapViewport`
- `MapCamera`
- `GeoJsonGeometry` / narrow GeoJSON helpers if not already available
- `MapFeatureRef`
- `MapFeatureKind`
- `TileCoordinate`
- `MapTilesetId`
- `MapOverlayDefinition`
- `MapOverlayVisibility`
- helpers to validate/format bbox, calculate simple bounds, count vertices,
  get centroid-ish fallback for simple GeoJSON, normalize overlay visibility,
  and build canonical tile query strings for whitelisted filters

Keep out of scope:

- Mapbox/MapLibre imports
- React map components
- `apps/web` UI
- route/habitat index redesign
- server SQL

Validation:

- `pnpm.cmd --filter @simmer-mosquito/mapping test`
- `pnpm.cmd --filter @simmer-mosquito/mapping typecheck`
- targeted Biome check for touched package files

## Worker 2: `apps/web/src/map`

Ownership:

- `apps/web/src/map/**`
- `apps/web/package.json` if web map dependencies are needed
- `apps/web/tsconfig.json` if adding a reference to `packages/mapping`

Goal:

Create reusable web map components and hooks under `apps/web/src/map`. This is
infrastructure only; do not redesign the habitats index route in this slice.

Required organization:

- Hooks live in `apps/web/src/map/hooks`.
- Each hook gets its own `.ts` file.
- Break components into reasonable `.tsx` files so code is inspectable.
- Avoid a single giant map component.

Suggested shape:

```text
apps/web/src/map/index.ts
apps/web/src/map/components/map-view.tsx
apps/web/src/map/components/map-controls.tsx
apps/web/src/map/components/map-overlay-menu.tsx
apps/web/src/map/components/map-status.tsx
apps/web/src/map/hooks/use-map-instance.ts
apps/web/src/map/hooks/use-map-overlays.ts
apps/web/src/map/hooks/use-vector-tile-source.ts
apps/web/src/map/hooks/use-geojson-source.ts
apps/web/src/map/hooks/use-map-resize.ts
apps/web/src/map/hooks/use-map-click-features.ts
apps/web/src/map/styles.ts
apps/web/src/map/types.ts
```

Expected capabilities:

- render a provider-backed map shell for web
- register authenticated MVT sources such as `/map/tiles/habitats/{z}/{x}/{y}.mvt`
- support optional overlay definitions with default visibility
- support bounded GeoJSON primary datasets for future route/mission maps
- expose click handling that returns feature ids/properties without assuming
  full row data is present
- keep auth/cookie behavior compatible with same-origin or configured server
  URL

Design/system notes:

- Follow existing web UI conventions and `packages/ui-web` primitives for
  controls/menus/buttons.
- Keep visible UI text minimal and functional.
- No landing page or route redesign.
- Do not create route-local CSS for ordinary styling.

Dependency note:

If the map renderer dependency is missing, choose the smallest reasonable
Mapbox/MapLibre integration for this repo and update only `apps/web` metadata.
If installing packages is blocked by network/sandbox approval, report the exact
dependency needed and leave the components typed around a narrow adapter where
possible.

Validation:

- `pnpm.cmd --filter @simmer-mosquito/web typecheck`
- targeted Biome check for touched web map files
- if a renderer is installed and a demo route is added later, verify in browser;
  for this slice, route integration is not required.

## Coordination

The two workers may run in parallel, but they have related contracts:

- Worker 1 should keep `@simmer-mosquito/mapping` exports small and stable.
- Worker 2 may import those exports if available, or define temporary local
  types only inside `apps/web/src/map/types.ts` if working before package
  integration lands.
- Do not duplicate large geometry helper logic in web if it belongs in
  `packages/mapping`.
- Do not move server tile code; only consume its public route shape.

## Suggested Skills

- Use repo `AGENTS.md` first: run `pnpm.cmd dlx @tanstack/intent@latest list`
  from the workspace root before substantial work.
- Use `impeccable` for Worker 2 if creating visual controls or map UI surfaces.
- Use `diagnose` only if renderer setup or typecheck failures require a bug
  loop.
