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
- Operator/admin verification surface for the foundation tables:
  - create/list addresses
  - create/list region folders and regions
  - create/list genera/species
  - enable organization species
  - create/list org collection methods, collection lures, and habitat types
- Operator admin auth no longer requires a selected WorkOS organization or local
  SIMMER membership; the allowlist in `SIMMER_OPERATOR_EMAILS` gates `/admin/*`.
- Foundation schema cleanup:
  - `spatial_features` is pure geometry plus generated lat/lng/GeoJSON/type.
  - org mailing address fields are inline on `organizations` with
    `mailing_*` names.
  - org-managed foundation tables have `created_by_profile_id` and
    `updated_by_profile_id`.
  - trivial `sort_order`, `species.is_special`, and organization species
    overrides were removed.
- First adult surveillance anchor:
  - `traps`
  - Kysely trap table types and create/list helpers.
  - Operator/admin verification create/list surface for traps.
- Adult surveillance event tables:
  - `collections`
  - `collection_species`
- Larval surveillance tables:
  - `habitats`
  - `inspections`
  - `samples`
  - `sample_species`
- Chemical control tables:
  - `units`
  - `application_methods`
  - `vehicles`
  - `equipment`
  - `insecticides`
  - `insecticide_batches`
  - `formulations`
  - `formulation_insecticides`
  - `applications`
  - `application_batches`

## Current Boundary

Auth and agency administration are now sufficient for the first product user
paths:

- SIMMER operator can create/link an agency organization.
- SIMMER operator can invite agency users with a SIMMER role.
- Invited users can sign in through WorkOS and resolve to an active SIMMER
  organization/profile/membership.
- Web can display auth/admin state through server-controlled endpoints.
- SIMMER operator can smoke-test the shared GIS/reference tables through a
  deliberately rough admin verification UI.

The project still does not have public product workflows for adult surveillance,
larval surveillance, or chemical control. ElectricSQL, TanStack DB collections,
mobile auth, and field workflows are still deferred.

Do not add a generic `sites` table yet. The old repo modeled concrete locatable
domain entities (`traps`, `habitats`, addresses, route items) rather than a
shared site abstraction. Keep that direction unless a concrete workflow proves
the abstraction is worth it.

## Recommended Next Slice

After the core operational tables:

- Review remaining shared workflow tables from the old repo: routes,
  assignments, tags, comments, and requested control actions.
- Keep writes server-authorized until the domain command and sync boundaries
  are clearer.

## Deferred

- Mobile auth/session token bridge.
- WorkOS event sync worker.
- Full domain command packages.
- Electric shape authorization.
- TanStack DB optimistic mutations.
- Generic `sites` abstraction.
- Trap route runs and habitat route runs.
- File/photo storage.
- Dedicated search service.
- Payment processing.
