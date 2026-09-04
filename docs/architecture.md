# SIMMER architecture

SIMMER is the Strategic Integrated Mosquito Management Enterprise Resources
platform. The product serves mosquito control agencies with a web management
console and a field-focused mobile app.

The architecture is Postgres-centered, sync-native, and multi-tenant. Railway is
the primary operational home for deployed services. WorkOS owns authentication
identity. SIMMER owns agency data, authorization decisions, domain workflows,
and historical attribution.

## Product shape

The MVP covers the full agency operating surface from the previous SIMMER work:

- Adult surveillance: traps and collections.
- Larval surveillance: habitats, inspections, and samples.
- Service requests and public engagement.
- Control workflows, routes, assignments, reference data, GIS, and reporting.

The first implementation focus is auth and identity. Domain workflow depth will
follow once the foundation is settled.

## Deployment shape

Production is one shared multi-tenant deployment serving many agencies.

Railway hosts:

- Postgres with PostGIS.
- ElectricSQL.
- Hono server.
- Web SPA service or static hosting.
- Admin SPA service or static hosting.

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

`apps/web` is a Vite React SPA using TanStack Router. It is the agency-facing
web app for authenticated agency workflows. The current shell exposes
WorkOS-backed browser auth, AuthContext display, and Electric/TanStack DB tracer
surfaces while the first product workflow shape is settled. It is not a
TanStack Start app.

The web app is online-only in v1. It uses sync-native reads and optimistic
domain-command writes for responsiveness and consistency, but it does not offer
offline persistence, offline command queues, or offline conflict resolution.
All agency roles use the web app for the workflows their role permits.

`apps/admin` is a Vite React SPA using TanStack Router. It is the SIMMER
operator control plane, not an agency administration surface. Its scope is
in-app operator auth, agency creation and support metadata, agency-scoped user
invitation and membership support, agency foundation bootstrapping (regions,
addresses, method/lure/habitat lookups, enabled species, and first traps),
global mosquito taxonomy management, and global unit management. Agency-owned
operational catalogs and workflows remain in `apps/web` unless a future
support/repair tool is explicitly operator-owned.

It is built on the same platform as `apps/web` rather than beside it: the
two-rail app shell, the TanStack Form field kit, the browser auth client, and
the panel/search primitives are all shared packages, and each app supplies only
its own navigation model, identity wiring, and routes. Reads follow the same
split as the web app: `useLiveQuery` over Electric-backed collections for the
global catalogs, `useQuery` for the operator-scoped `/admin/*` JSON endpoints,
which are not tenant-scoped and so have no shape to authorize. The console
deliberately carries no map: geometry for the foundation endpoints comes from
KML/KMZ/GeoJSON files and typed coordinates, keeping `mapbox-gl` out of its
bundle.

Access is all-or-nothing, unlike the web app's role ladder: a session in the one
WorkOS organization that is SIMMER (`SIMMER_OPERATOR_ORG_ID`) reaches every
`/admin/*` endpoint, and any other session reaches none, including the same
person's while they are signed in to an agency they administer. The console
renders that refusal as an explanation rather than an error.

`apps/preview` is an internal Vite React/TanStack Router application for
component preview, design-token inspection, visual-regression surfaces, and
design-system workshop flows. It is not a production product surface. It imports
workspace packages directly so changes in `packages/design-tokens` and
`packages/ui-web` are visible during local preview development.

`apps/mobile` is the Expo managed React Native field app (SDK 57, expo-router).
It currently exists as a scaffold: it signs in against the same `/auth/*`
endpoints the web apps use, holds the resulting sealed session in SecureStore
rather than a cookie (ADR 0016), and renders the resolved `AuthContext`. TanStack
DB, ElectricSQL, local persistence, offline transactions, and the map are all
still ahead of it — the mobile matrix in `docs/sync.md` describes the plan, not
the app.

It has no `packages/ui-mobile` yet. Components are app-local until a second
consumer justifies the package, which is the same promotion rule `AGENTS.md`
applies to `packages/ui-web`.

Mobile offline support is automatic and scoped, not a manual global switch. The
field app should persist the field-critical baseline for the selected
organization after sign-in, then persist additional work-scoped data as users
load or receive it. It should not attempt to persist the entire organization
database.

`apps/server` is the Hono control plane. It owns WorkOS callbacks, web/admin
session cookies, reusable AuthContext resolution, SIMMER operator control-plane
endpoints, the mobile bearer session transport, Electric shape authorization,
command endpoints, authenticated map vector tile reads, and server-authorized
Postgres writes.

## Packages

Existing:

- `packages/auth`: WorkOS AuthKit and session helpers.
- `packages/config`: shared env parsing primitives.
- `packages/db`: dbmate SQL migrations, Kysely/Postgres helpers, generated DB
  type target.
- `packages/design-tokens`: framework-free design tokens for SIMMER colors,
  surfaces, type, spacing, radius, motion, and CSS/TypeScript consumers.
- `packages/domain`: framework-agnostic domain types, commands, validators, and
  aggregate helpers.
- `packages/mapping`: provider-neutral geometry, GeoJSON, feature reference, and
  viewport helpers.
- `packages/sync`: framework-agnostic TanStack DB collection factories, per-table
  row schemas generated from the database, and the optimistic command adapters.
- `packages/ui-web`: shadcn-style web component source, shared styles, and the
  semantic web icon registry.

Each domain under `packages/domain/src` is a folder with its own `index.ts`, and
the package exports one public entry, `src/index.ts`. `control-operations/` is
split by method catalogs, assets, products and formulations, performed actions,
and requested actions, while `public-engagement/` is split by contacts, service
requests, notification types, registrations, and mission notifications.

Domain tests live under `packages/domain/src/tests/unit`, which is the layout
every app and package follows: each one keeps its suites in `src/tests/`, split
into `unit/` and `integration/` (and `e2e/` when there is one), mirroring the
`src` tree below that. Nothing is colocated with the code it covers, so a
directory listing of a domain folder is the implementation and only the
implementation.

Planned:

- `packages/ui-mobile`: mobile platform component system, for when `apps/mobile`
  exists.

Shared packages should avoid React and platform-specific storage unless their
name explicitly says otherwise.

## Design system

SIMMER centralizes durable visual decisions in shared modules rather than
letting colors, component variants, and interaction states sprawl through app
routes.

`packages/design-tokens` is the framework-free source for raw visual constants.
It exposes CSS variables for stylesheets and TypeScript constants for contexts
that cannot consume CSS variables, such as maps, charts, mobile adapters, and
future exports. It does not own React components, icons, or shadcn source files.

`packages/ui-web` owns the web component system. It uses shadcn-style source
components backed by Radix primitives, Tailwind utilities, and shared tokens.
App code should compose these components first, use `cva` variants for repeated
styling choices, merge classes with `cn`, and reserve route-level class names
mostly for layout.

Web styling should not split into parallel CSS-only and Tailwind/shadcn
methodologies. Ordinary UI surfaces in `apps/web` and `apps/admin`, including
details cards, panels, rows, tabs, badges, and forms, should be React components
composed from shadcn primitives with Tailwind classes. Product-specific styling
may live in app-owned components while it is isolated to one workflow; repeated
styling should be promoted into `packages/ui-web` as a `cva` variant or a small
shared component. App CSS is reserved for globals, token exposure, vendor or
browser-specific selectors, keyframes, and rare cases Tailwind cannot express
clearly.

Web icons are owned by `packages/ui-web` through a semantic icon registry.
Frontends should import registered icons from
`@simmer-mosquito/ui-web/icons/registry`, not from `lucide-react` directly.
Lucide is the default registry source for now, with SIMMER-owned assets for the
brand mark and mosquito/adult-surveillance icon.

The planned `packages/ui-mobile` module owns mobile UI. It shares design-token
decisions with web, but it does not share web components.

SIMMER does not use Storybook as a design-system contract. Use `apps/preview`
for living styleguide pages, kitchen-sink visual regression, sandbox controls,
and template/accessibility stress tests.

The fuller design-system architecture lives in `docs/design-system.md`.

## Data flow

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

Location-bearing commands carry a domain location source, not database geometry
columns.
The source may be explicit GeoJSON geometry or a same-organization locatable
domain record such as a habitat, inspection, trap, collection, service request,
requested control action, or mission item. The server stores explicit geometry
directly on the target row or snapshots the source record's existing owned
geometry inside the authorized transaction. Geometry coordinates are preserved
as submitted by apps or source imports. Read/sync rows expose each table's
trigger-maintained centroid columns (`lat`, `lng`, `geom_type`) so pins and
coordinate reads ride the synced row directly. Full geometry (`geom`, `geojson`)
stays server-only. It is read through the `/map/*` endpoints, never streamed
through an Electric shape, because Postgres logical replication does not publish
`GENERATED` columns and the geojson payload is unbounded.

Open-ended map browsing uses authenticated MVT endpoints from `apps/server`.
Those tile endpoints are viewport and zoom render projections over owned
geometry, not the authoritative row read model. Bounded object-context maps,
such as route and mission detail views, may continue to use GeoJSON for the
selected work items and optionally overlay MVT context layers.

## Authorization

SIMMER uses server-side authorization, not Postgres RLS.

The server resolves an `AuthContext` from either:

- WorkOS sealed session cookie for web.
- The same sealed session presented as an `Authorization: Bearer` credential by
  `apps/mobile`, held in SecureStore. Not a second token format. See ADR 0016.

That context includes the WorkOS user, SIMMER user, selected organization,
profile, membership, and role. It authorizes sync shapes and command endpoints.

The database owns integrity: foreign keys, constraints, indexes, PostGIS types,
and timestamps. It does not own the primary authorization model.

## Identity model

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

SIMMER operator tooling in `apps/admin` creates and links WorkOS organizations,
stores manual subscription metadata, sends WorkOS invitations, and stages
invited profile/membership records so the lazy login path can activate them
later without changing the invited role.

**None of the WorkOS half of that runs on staging.** Staging authenticates
against the WorkOS production directory, so it refuses every WorkOS identity
write with a 403 and writes only SIMMER's own rows. Signing in and switching
Agency work; inviting, changing a role, removing access, resetting a password,
signing up and creating an Agency do not. See ADR 0017 before changing anything
that calls WorkOS.

## Tenancy

`organization_id` is stored on tenant-owned parent/root records. Child records
derive tenant through foreign keys. Add `organization_id` to child tables only
when query, sync, lifecycle, or indexing pressure proves it useful.

This is an intentional departure from RLS-driven schemas that require
`organization_id` everywhere.

Do not add a generic `sites` table. Location lives on the concrete domain
entities that own it: traps, habitats, addresses, route items, service requests,
requested control actions, mission items. A shared site model needs a workflow
that proves it is worth the indirection.

## Audit and provenance

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

## Schema and types

SQL migrations are the source of truth. dbmate applies migrations. Kysely is the
server query builder.

`pnpm db:migrate` applies the migrations and dumps the realised schema to
`packages/db/schema.sql`, which is checked in. `pnpm generate:table-types` reads
that dump and writes `packages/db/src/tables.ts`: the `SimmerDatabase` interface,
one interface per table, and the enum unions behind the Postgres enum types. It
needs no database, because the dump is the database's own answer. Nothing in that
file is hand-maintained, and `pnpm check:table-types` in CI's `verify` job fails
on a difference between it and the dump.

The client's half of the same columns is the row schemas in `packages/sync`,
written by `pnpm generate:schemas` and then owned by hand. What holds the two
together is the type-level drift check in
`packages/sync/src/tests/unit/collections/tables/drift.test.ts`, which fails
`tsc` when a table has a column no schema covers, a schema has a field no column
covers, or the two disagree about a column's type.

These legacy tables from the old system are deliberately absent until a
workflow needs them: `deleted_data`, `roles`, `tag_groups`, `species_groups`,
`species_group_species`, and the contact-level notification preference join
tables.

Domain/app types may be richer than DB row types. Explicit mappers translate
between DB/sync rows and domain aggregates or commands. Do this at workflow and
aggregate boundaries, not as a giant generic translation framework.

## Local development

Everything runs on your machine. Postgres and Electric come from
`docker-compose.yml`, and nothing local points at Railway. See
`docs/deployment.md`, "Local development", for the full setup.

Apps run as local pnpm/Nx processes:

- `pnpm dev:server`
- `pnpm dev:admin`
- `pnpm dev:web`
- `pnpm dev:mobile` starts Expo, and it wants a terminal of its own. See
  `apps/mobile/README.md`.
- `pnpm dev:preview`
- `pnpm dev:caddy` for the local reverse proxy

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
