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

`apps/web` is a Vite React SPA using TanStack Router. The current shell exposes
WorkOS-backed browser auth, AuthContext display, and SIMMER operator agency
administration through the server control plane. TanStack DB and ElectricSQL
will be added after the auth/admin foundation and first domain workflow shape
are settled. It is not a TanStack Start app.

The web app is online-only in v1. It uses sync-native reads and optimistic
domain-command writes for responsiveness and consistency, but it does not offer
offline persistence, offline command queues, or offline conflict resolution.
All agency roles use the web app for the workflows their role permits.

`apps/mobile` is planned as an Expo managed React Native app using TanStack DB,
ElectricSQL, SecureStore-backed auth, and later local persistence/offline
transactions.

Mobile offline support is automatic and scoped, not a manual global switch. The
field app should persist the field-critical baseline for the selected
organization after sign-in, then persist additional work-scoped data as users
load or receive it. It should not attempt to persist the entire organization
database.

`apps/server` is the Hono control plane. It owns WorkOS callbacks, web session
cookies, reusable AuthContext resolution, SIMMER operator agency administration,
future mobile session exchange, Electric shape authorization, command endpoints,
and server-authorized Postgres writes.

`apps/worker` owns background work: WorkOS event sync, scheduled maintenance,
imports, reports, and future retryable jobs if needed.

## Packages

Existing:

- `packages/auth`: WorkOS AuthKit and session helpers.
- `packages/config`: shared env parsing primitives.
- `packages/db`: dbmate SQL migrations, Kysely/Postgres helpers, generated DB
  type target.
- `packages/design-tokens`: framework-free design tokens, currently SIMMER
  brand colors as CSS variables and TypeScript constants.
- `packages/domain`: framework-agnostic domain types, commands, validators, and
  aggregate helpers.

`packages/domain/src` keeps stable public domain seams as top-level barrel
modules such as `control-operations.ts`, `public-engagement.ts`, and
`weather.ts`. Larger domains keep their implementation in matching folders
behind those seams. For example, `control-operations/` is split by method
catalogs, assets, products/formulations, performed actions, and requested
actions, while `public-engagement/` is split by contacts, service requests,
notification types, registrations, and mission notifications.

Domain tests live under `packages/domain/src/tests`. The package test script
targets that folder directly so compiled output under `dist` is not discovered
as a second test source.

Planned:

- `packages/sync`: framework-agnostic TanStack DB collection factories, Electric
  shape definitions, row schemas, and optimistic command adapters.
- `packages/client`: framework-agnostic server command client.
- `packages/mapping`: provider-neutral geometry, GeoJSON, feature reference, and
  viewport helpers.
- `packages/ui-web` and `packages/ui-mobile`: separate platform component
  systems.

Shared packages should avoid React and platform-specific storage unless their
name explicitly says otherwise.

## Design System

SIMMER centralizes durable visual decisions in shared modules rather than
letting colors, component variants, and interaction states sprawl through app
routes.

`packages/design-tokens` is the framework-free source for raw visual constants.
It exposes CSS variables for stylesheets and TypeScript constants for contexts
that cannot consume CSS variables, such as maps, charts, mobile adapters, and
future exports. It does not own React components, icons, or shadcn source files.

The planned `packages/ui-web` module owns the web component system. It should use
shadcn-style source components backed by Radix primitives, Tailwind utilities,
and shared tokens. App code should use component variants for repeated styling
choices and reserve route-level class names mostly for layout.

The planned `packages/ui-mobile` module owns mobile UI. It shares design-token
decisions with web, but it does not share web components.

SIMMER does not use Storybook as a design-system contract. If visual previews
are useful, prefer lightweight development-only preview routes inside `apps/web`
so previews run in the real app environment.

The fuller design-system architecture lives in `docs/design-system.md`.

## Data Flow

Reads are sync-native:

```text
Postgres -> ElectricSQL -> TanStack DB -> web/mobile UI
```

Clients do not talk directly to Postgres. Clients do not get unrestricted access
to Electric. The server authorizes sync shapes before Electric streams data.
For normal authenticated organization screens, Electric-backed TanStack DB
collections are the default read path. Server query endpoints are reserved for
auth/session, command writes, imports, SIMMER operator control-plane workflows,
specialized reports/exports, and views that are genuinely hard or inappropriate
to compute from synced client collections.

Web collection loading uses a hybrid sync policy:

- **Eager** for small, role-visible baseline tables that should be ready after
  organization selection. Use eager only when the product is comfortable
  baselining the entire selected-organization rowset for the table.
- **On-demand** for large or workflow-specific tables that should load from the
  active screen's live query predicates.
- **Progressive** only when a screen needs fast first paint for a subset and a
  clear product reason to keep filling the broader collection in the
  background.

The sync mode is chosen per collection or feature slice from expected row count,
workflow criticality, and whether most users will inspect most rows in a normal
session.

The table-level web and mobile sync matrix lives in `docs/sync.md`.

Web writes go through domain commands and TanStack DB optimistic mutations:

```text
UI intent
  -> domain command helper
  -> TanStack DB optimistic mutation with command meta
  -> Hono command endpoint
  -> Kysely transaction
  -> Postgres commit/txid
  -> Electric sync confirmation
```

Future offline queues should store domain commands, not DB-shaped patches. The
v1 web app does not queue commands for offline replay.

Location-bearing commands carry a domain location source, not `feature_id`.
The source may be explicit GeoJSON geometry or a same-organization locatable
domain record such as a habitat, inspection, trap, collection, service request,
requested control action, or mission item. The server maps explicit geometry to
`spatial_features.id` or snapshots the source record's existing `feature_id`
inside the authorized transaction, applying the domain precision policy for the
workflow when geometry is explicit. Read/sync rows may still expose `feature_id`
and spatial feature data because those are database representation details.

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
  profile, role, and status. Memberships can begin as invited records linked to
  an org-scoped profile before the user accepts the WorkOS invitation.

A user can belong to multiple organizations. A profile is the stable org-scoped
domain actor used by field records and audit fields.

SIMMER operator tooling creates and links WorkOS organizations, stores manual
subscription metadata, sends WorkOS invitations, and stages invited
profile/membership records so the lazy login path can activate them later
without changing the invited role.

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
- `pnpm dev:web`
- `pnpm dev:worker`
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

SIMMER stores manual subscription metadata per organization, such as trial,
active, suspended, or canceled. Subscription status is enforced by server
authorization, not by WorkOS billing.
