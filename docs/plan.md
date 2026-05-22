# SIMMER Implementation Plan

This file tracks the current boundary, the next implementation slice, and
deferred work. Historical decisions live in `docs/adr/`; domain decisions live
in `docs/*-domain.md`; deployment details live in `docs/deployment.md`.

## Current Boundary

Auth, identity, deployment, domain-command design, and the first read-only sync
tracer are in place.

What works now:

- SIMMER operator can create/link an agency organization.
- SIMMER operator can invite agency users with a SIMMER role.
- SIMMER operator can invite an existing login-less agency profile by profile
  id, preserving imported/historical attribution when that person signs in.
- Invited users can sign in through WorkOS and resolve to an active SIMMER
  organization/profile/membership.
- Web can display auth state through server-controlled endpoints.
- Admin can display SIMMER operator organization/user management through
  server-controlled endpoints.
- Admin has scaffold pages for SIMMER-controlled global taxonomy and units.
- Design-system preview infrastructure exists in `apps/preview`.
- `packages/design-tokens` owns brand scales, semantic aliases, typography,
  spacing, radius, motion, and CSS variable mappings.
- `packages/ui-web` owns shared shadcn-style web components and the semantic
  icon registry. Web frontends should import registered icons through
  `@simmer-mosquito/ui-web/icons/registry`, not from lucide directly.
- The database has the main domain tables for surveillance, control operations,
  service requests, assignments, routes, missions, notifications, weather, and
  region intersection caching.
- Domain command vocabularies and schema direction are recorded for adult
  surveillance, larval surveillance, field-work support, organization settings,
  foundation/reference data, control operations, public engagement, mission
  dispatch, and weather.
- `packages/domain` exposes those command vocabularies behind stable public
  seams, with tests under `packages/domain/src/tests`.
- Railway staging and production environments exist, with PostGIS and Electric
  configured for the current read path.
- GitHub Actions owns migration and Railway deployment pipelines.
- The signed-in web tracer has proven:
  `Postgres -> Electric -> server-authorized shape proxy -> TanStack DB -> UI`.

What is still missing:

- Hardened public product workflows for the main agency tables.
- Server command endpoints for the domain command vocabulary beyond the current
  implemented slices.
- Import flows.
- Production UI for the agency workflows.
- Expanded sync boundaries beyond the current tracer.

Do not add a generic `sites` table yet. Use concrete locatable domain entities
such as traps, habitats, addresses, route items, service requests, requested
control actions, and mission items unless a workflow proves a shared site model
is worth it.

## Recommended Next Slice

Exercise the foundation lookup command-backed TanStack DB mutation tracers, then
extend the pattern deliberately.

This slice should prove the write-confirmation path that follows the read-only
tracer:

```text
UI intent
  -> domain command helper
  -> TanStack DB optimistic mutation with command meta
  -> Hono command endpoint
  -> Kysely transaction
  -> Postgres commit/txid
  -> Electric sync confirmation
```

Status:

- Implemented for selected-organization `collection_methods`,
  `collection_lures`, and `habitat_types`.

Scope for the next extension:

- Pick the next small eager collection only after the foundation lookup tracers
  have been exercised.
- Add the server-authorized command endpoint.
- Commit through the domain command contract in `docs/domain-command-contract.md`.
- Return the matching Electric transaction id from the same Postgres
  transaction.
- Wire the TanStack DB optimistic mutation handler.
- Keep broader workflow screens and on-demand reads out of this slice.

Acceptance criteria:

- The client can optimistically update the selected collection through TanStack
  DB.
- The server commits through an explicit command endpoint, not a generic DB
  patch.
- The response includes the transaction id needed for Electric confirmation.
- The synced collection reconciles with the committed Postgres row.
- Tests cover the domain builder, server handler boundary, and client mutation
  behavior appropriate to the chosen collection.

## Recent Completed Slices

- Monorepo scaffold, Hono server, WorkOS AuthKit login, sealed web session, and
  reusable AuthContext resolution.
- SQL-first dbmate migrations and Kysely helpers.
- Identity and agency administration foundation.
- Core GIS, taxonomy, lookup, surveillance, control, public engagement,
  mission, notification, weather, and field-work support tables.
- Domain-command design and `packages/domain` implementation for the current
  schema groups.
- Design-system consolidation into `packages/design-tokens`, `packages/ui-web`,
  and `apps/preview`.
- Railway staging/production reset with migration and app deployment pipelines.
- Read-only web sync tracer for units, profiles, taxonomy, organization species,
  foundation lookup catalogs, tags, and route headers.
- Command-backed web sync tracer for foundation lookup catalogs, including
  optimistic TanStack DB mutation handlers, foundation command endpoints, Kysely
  commits, and same-transaction Electric txid responses.

## Deferred

- Mobile auth/session token bridge.
- WorkOS event sync worker.
- More Electric shape authorization hardening.
- Generic `sites` abstraction.
- Trap route runs and habitat route runs.
- File/photo storage.
- Dedicated search service.
- Payment processing.
- Legacy old-repo tables intentionally skipped unless workflows prove they are
  needed:
  - `deleted_data`
  - `roles`
  - `tag_groups`
  - `species_groups`
  - `species_group_species`
  - contact-level notification preference join tables
