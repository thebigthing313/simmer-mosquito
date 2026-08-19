# ADR 0007: Shared sync descriptors with per-frontend collections

Status: Accepted, amended by
[ADR 0014](0014-generated-table-schemas-replace-sync-descriptors.md)

Date: 2026-05-14

> **Read 0014 before acting on this.** The package boundary below still holds:
> shared contracts in `packages/sync`, collection singletons per frontend, and
> no universal prebuilt collection exported from the package. The mechanism does
> not. Descriptors are deleted and replaced by schemas generated from the
> migrations; `syncMode`, preload policy, and retention moved to the app; and
> tracer descriptor sets are gone. The `packages/sync` responsibility list in
> **Decision** and the last bullet of **Consequences** are the parts 0014
> replaces.

## Context

SIMMER uses ElectricSQL and TanStack DB as the normal read path for
authenticated organization screens. Web and mobile need the same domain row
contracts, table names, parser behavior, key extraction, and command
transaction-id conventions.

The two frontends do not need identical collection instances. The web app is
online-only and route/screen driven. The mobile field app uses automatic scoped
offline persistence, progressive downloads for some large field catalogs, and
rolling retention windows for recent history.

TanStack DB collections are singleton instances. Sharing one prebuilt collection
singleton across frontends would force web and mobile into the same sync mode,
persistence behavior, lifecycle, and preload strategy.

## Decision

Create a shared sync foundation package for row contracts and sync descriptors,
while each frontend owns its concrete TanStack DB collection instances.

`packages/sync` owns:

- row schemas and Electric parser behavior;
- `getKey` functions;
- table and shape descriptors;
- named tracer descriptor sets when a vertical slice needs an explicit boundary;
- dependency relationships such as `address_id` plus owned geometry projection
  columns;
- web and mobile policy descriptors;
- retention metadata for rolling windows;
- shared helpers for Electric transaction-id mutation handling.

`apps/web` owns web collection singletons, web preload bundles, and route
live-query preloads.

`apps/mobile` owns persisted mobile collection singletons, progressive sync,
download behavior, and retention cleanup.

The table-level sync matrix lives in `docs/sync.md` and can evolve without
changing this package-boundary decision.

## Consequences

- Web and mobile can choose different sync modes and persistence behavior for
  the same table.
- Shared schemas, parsers, keys, and dependency metadata prevent duplicate
  frontend-specific sync definitions.
- Mobile can add SQLite persistence and rolling-window cleanup without making
  web pay that complexity cost.
- Web can stay online-only and route-driven while still using the same domain
  row contracts.
- Implementers must avoid exporting universal prebuilt collection singletons
  from `packages/sync`.
- Read-only tracer descriptor sets should not include TanStack DB mutation
  handlers. Mutation descriptor sets must add server command handlers and
  Electric txid confirmation deliberately; the foundation lookup catalogs are
  the first command-backed descriptors.
