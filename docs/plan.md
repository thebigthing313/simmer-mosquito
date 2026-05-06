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

## Current Boundary

Auth and agency administration are now sufficient for the first product user
paths:

- SIMMER operator can create/link an agency organization.
- SIMMER operator can invite agency users with a SIMMER role.
- Invited users can sign in through WorkOS and resolve to an active SIMMER
  organization/profile/membership.
- Web can display auth/admin state through server-controlled endpoints.

The project still does not have operational domain tables, ElectricSQL, TanStack
DB collections, mobile auth, or field workflows.

## Recommended Next Slice

Add the first operational database skeleton for shared reference and geography
foundations, without building full workflows yet.

Scope:

- Add SQL migrations for foundational tables used by both adult and larval MVP
  workflows:
  - `spatial_features`
  - `organization_addresses`
  - `regions`
  - `region_folders`
  - `species`
  - `genera`
  - method lookup tables needed for first trap/habitat records
- Enable and use PostGIS types intentionally.
- Keep `organization_id` on tenant-owned parent/root records only.
- Add Kysely types/helpers for inserting and listing small reference data.
- Add operator/admin endpoints and minimal web UI only where needed to verify
  the schema.
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
