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
- Other intervention tables:
  - `source_reduction_methods`
  - `outreach_methods`
  - `biocontrol_methods`
  - `source_reductions`
  - `outreach_actions`
  - `biocontrol_actions`
- Contact and request intake tables:
  - `contacts`
  - `service_requests`
- Shared operational tables:
  - `comments`
  - `tags`
  - `tag_items`
  - `additional_personnel`
  - `routes`
  - `route_items`
  - `assignments`
  - `assignment_items`
- Control recommendation and dispatch tables:
  - `requested_control_actions`
  - `missions`
  - `mission_items`
- Notification tables:
  - `notification_types`
  - `notification_registrations`
  - `notification_registration_types`
  - `mission_notifications`
- Weather analytics tables:
  - `weather_sources`
  - `weather_source_subscriptions`
  - `weather_summaries`
- Region intersection cache table:
  - `spatial_feature_regions`
- The new schema has table-level feature parity with the old `F:\simmer`
  domain model, with intentional redesigns for tags, addresses, weather,
  missions, notifications, and custom method schemas.

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

The database now has the main domain tables needed for adult surveillance,
larval surveillance, chemical control, other interventions, service requests,
assignments, routes, control recommendations, missions, notifications, weather
summaries, and region intersection caching.

The project still does not have hardened public product workflows for those
tables. Most operational tables currently have schema and Kysely typings only;
domain commands, server endpoints, import flows, sync boundaries, and production
UI remain to be built deliberately.

Do not add a generic `sites` table yet. The old repo modeled concrete locatable
domain entities (`traps`, `habitats`, addresses, route items) rather than a
shared site abstraction. Keep that direction unless a concrete workflow proves
the abstraction is worth it.

## Recommended Next Slice

Move from schema parity to behavior:

- Define the first real domain command slice, likely a narrow adult surveillance
  workflow around traps and collections.
- Decide which tables need immediate create/list/read helpers versus which
  should wait for domain-command design.
- Add server-authorized writes for the chosen workflow and keep cross-table
  validation in the domain layer.
- Preserve the rough admin verification UI only as a smoke-test surface until
  product workflows replace it.
- Consider a GIS cache refresh function for `spatial_feature_regions` when
  region lookup behavior becomes part of a workflow.

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
- Legacy old-repo tables intentionally skipped unless workflows prove they are
  needed:
  - `deleted_data`
  - `roles`
  - `tag_groups`
  - `species_groups`
  - `species_group_species`
  - contact-level notification preference join tables
