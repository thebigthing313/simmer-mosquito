# SIMMER Architecture

SIMMER is the Strategic Integrated Mosquito Management Enterprise Resources
platform. The product serves mosquito control agencies with a web management
console and a field-focused mobile app.

The architecture is Postgres-centered, sync-native, and multi-tenant. Railway is
the primary operational home for deployed services. WorkOS owns authentication
identity. SIMMER owns agency data, authorization decisions, domain workflows,
and historical attribution.

## Product Shape

The MVP covers the full agency operating surface from the previous SIMMER work:

- Adult surveillance: traps and collections.
- Larval surveillance: habitats, inspections, and samples.
- Service requests and public engagement.
- Control workflows, routes, assignments, reference data, GIS, and reporting.

The first implementation focus is auth and identity. Domain workflow depth will
follow once the foundation is settled.

## Deployment Shape

Production is one shared multi-tenant deployment serving many agencies.

Railway hosts:

- Postgres with PostGIS.
- ElectricSQL.
- Hono server.
- Background worker.
- Web SPA service or static hosting.

External services:

- WorkOS for AuthKit, users, and organization login context.
- Mapbox for map rendering.

Services intentionally postponed:

- Payment processing.
- Dedicated search service.
- Dedicated warehouse.
- Object/file storage.
- Redis or queue service.

## Applications

`apps/web` is planned as a Vite React SPA using TanStack Router, TanStack DB,
and ElectricSQL. It is not a TanStack Start app.

`apps/mobile` is planned as an Expo managed React Native app using TanStack DB,
ElectricSQL, SecureStore-backed auth, and later local persistence/offline
transactions.

`apps/server` is the Hono control plane. It owns WorkOS callbacks, web session
cookies, future mobile session exchange, Electric shape authorization, command
endpoints, and server-authorized Postgres writes.

`apps/worker` owns background work: WorkOS event sync, scheduled maintenance,
imports, reports, and future retryable jobs if needed.

## Packages

Existing:

- `packages/auth`: WorkOS AuthKit and session helpers.
- `packages/config`: shared env parsing primitives.
- `packages/db`: dbmate SQL migrations, Kysely/Postgres helpers, generated DB
  type target.
- `packages/domain`: framework-agnostic domain types, commands, validators, and
  aggregate helpers.

Planned:

- `packages/sync`: framework-agnostic TanStack DB collection factories, Electric
  shape definitions, row schemas, and optimistic command adapters.
- `packages/client`: framework-agnostic server command client.
- `packages/mapping`: provider-neutral geometry, GeoJSON, feature reference, and
  viewport helpers.
- `packages/tokens`: shared design tokens.
- `packages/ui-web` and `packages/ui-mobile`: separate platform component
  systems.

Shared packages should avoid React and platform-specific storage unless their
name explicitly says otherwise.

## Data Flow

Reads are sync-native:

```text
Postgres -> ElectricSQL -> TanStack DB -> web/mobile UI
```

Clients do not talk directly to Postgres. Clients do not get unrestricted access
to Electric. The server authorizes sync shapes before Electric streams data.

Writes go through domain commands and TanStack DB optimistic mutations:

```text
UI intent
  -> domain command helper
  -> TanStack DB optimistic mutation with command meta
  -> Hono command endpoint
  -> Kysely transaction
  -> Postgres commit/txid
  -> Electric sync confirmation
```

Offline queues should store domain commands, not DB-shaped patches.

## Authorization

SIMMER uses server-side authorization, not Postgres RLS.

The server resolves an `AuthContext` from either:

- WorkOS sealed session cookie for web.
- Future mobile app session token from SecureStore.

That context includes the WorkOS user, SIMMER user, selected organization,
profile, membership, and role. It authorizes sync shapes and command endpoints.

The database owns integrity: foreign keys, constraints, indexes, PostGIS types,
and timestamps. It does not own the primary authorization model.

## Identity Model

WorkOS identities are separate from SIMMER domain identities.

- `users`: global login identities linked to WorkOS users.
- `organizations`: SIMMER agencies linked to WorkOS organizations.
- `profiles`: org-scoped people used for historical attribution. Profiles may
  exist without login access.
- `memberships`: current access relationship between user, organization,
  profile, role, and status.

A user can belong to multiple organizations. A profile is the stable org-scoped
domain actor used by field records and audit fields.

## Tenancy

`organization_id` is stored on tenant-owned parent/root records. Child records
derive tenant through foreign keys. Add `organization_id` to child tables only
when query, sync, lifecycle, or indexing pressure proves it useful.

This is an intentional departure from RLS-driven schemas that require
`organization_id` everywhere.

## Audit And Provenance

Keep three concepts separate:

- Tenant ownership: `organization_id`.
- Domain performer: `inspected_by_profile_id`, `collected_by_profile_id`,
  `applied_by_profile_id`, `received_by_profile_id`, and similar verb-shaped
  fields.
- Technical audit: `created_by_profile_id`, `updated_by_profile_id`,
  `deleted_by_profile_id`.

Hono command handlers set profile audit fields. Postgres owns audit timestamps
with defaults and SQL expressions.

Core operational records use soft delete fields:

- `deleted_at`
- `deleted_by_profile_id`

A separate deleted-data audit table is not part of the initial design.

## Schema And Types

SQL migrations are the source of truth. dbmate applies migrations. Kysely is the
server query builder. `kysely-codegen` should generate database table types from
the migrated database once the schema grows beyond the initial hand-written
slice.

Domain/app types may be richer than DB row types. Explicit mappers translate
between DB/sync rows and domain aggregates or commands. Do this at workflow and
aggregate boundaries, not as a giant generic translation framework.

## Local Development

Local infrastructure runs in Docker Compose:

- Postgres with PostGIS.
- ElectricSQL later.

Apps run as local pnpm/Nx processes:

- `pnpm dev:server`
- `pnpm dev:worker`
- future `pnpm dev:web`
- future mobile Expo commands

Daily development should not require Railway local tooling.

## Testing

Testing emphasis:

- Fast Vitest unit tests around domain commands and validators.
- Postgres-backed integration tests around server command handlers and db
  helpers.
- App-level E2E tests only for critical web/mobile flows.

## Billing

Agency billing is manual for MVP. Government agencies usually will not keep a
credit card on file inside the app.

SIMMER should eventually store manual subscription metadata per organization,
such as trial, active, suspended, or canceled. Subscription status is enforced by
server authorization, not by WorkOS billing.
