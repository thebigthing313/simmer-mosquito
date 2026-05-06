# SIMMER Implementation Plan

This plan tracks the near-term build order. Architecture decisions live in
`docs/adr/`; this file records implementation progress and the next slice.

## Completed Foundation

- Nx/pnpm monorepo scaffold.
- Hono `apps/server` control plane.
- WorkOS AuthKit browser login.
- Sealed web session cookie.
- Local Postgres/PostGIS through Docker Compose.
- SQL-first dbmate migrations.
- Kysely database helpers.
- Identity tables:
  - `users`
  - `organizations`
  - `profiles`
  - `memberships`
- Lazy WorkOS login upsert into SIMMER identity tables.
- Multi-organization capable identity model.
- Reusable server AuthContext resolver/middleware.
- Vite React `apps/web` auth shell.
- SIMMER operator organization administration.
- Manual organization subscription metadata.
- Operator-managed WorkOS invitations.
- Staged invited profiles/memberships.
- Lazy login activation of invited memberships while preserving the invited
  SIMMER role.
- Core GIS database skeleton:
  - `spatial_features`
  - `addresses`
  - `region_folders`
  - `regions`
- Kysely GIS table types and small create/list helpers.
- Global taxonomy tables:
  - `genera`
  - `species`
  - `organization_species`
- Org-owned lookup tables with inline custom form schema:
  - `collection_methods`
  - `collection_lures`
  - `habitat_types`
- Kysely taxonomy/lookup table types and small create/list helpers.

## Current Boundary

Auth and agency administration are now sufficient for the first product user
paths:

- SIMMER operator can create/link an agency organization.
- SIMMER operator can invite agency users with a SIMMER role.
- Invited users can sign in through WorkOS and resolve to an active SIMMER
  organization/profile/membership.
- Web can display auth/admin state through server-controlled endpoints.

The project still does not have adult/larval operational workflow tables,
ElectricSQL, TanStack DB collections, mobile auth, or field workflows.

## Recommended Next Slice

Add the smallest operator/admin verification surface for the shared GIS and
reference foundations, without building full workflows yet.

Scope:

- Add operator/admin endpoints and minimal web UI only where needed to verify
  the schema:
  - create/list addresses
  - create/list region folders and regions
  - create/list genera/species
  - create/list org collection methods, collection lures, and habitat types
- Do not add ElectricSQL/TanStack DB yet.
- Do not add route runs, collections, inspections, or samples yet.

Rationale:

- Electric shapes and domain workflows need stable table boundaries.
- Both adult and larval workflows depend on shared GIS/reference concepts.
- Starting with low-risk reference/geography tables lets us validate SQL-first
  migrations, PostGIS, Kysely, and admin management before field workflow state
  arrives.

## Following Slice

After reference/geography foundations:

- Add `packages/sync` with the first read-only Electric/TanStack DB collection
  shape for small reference data.
- Keep writes server-authorized.
- Use this to prove the sync-native path before adding trap/habitat workflows.

## Deferred

- Mobile auth/session token bridge.
- WorkOS event sync worker.
- Full domain command packages.
- Electric shape authorization.
- TanStack DB optimistic mutations.
- Trap route runs, habitat route runs, collections, inspections, and samples.
- File/photo storage.
- Dedicated search service.
- Payment processing.
