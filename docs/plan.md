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
- Org-owned lookup tables:
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
- Database migrations were flattened from incremental parity-work files into
  domain-grouped dbmate migrations:
  - identity and organizations
  - spatial, taxonomy, and foundation
  - adult surveillance
  - larval surveillance
  - control operations
  - field-work support
  - contacts and service requests
  - notifications
  - weather
- `samples.organization_id` was removed; samples derive tenant ownership through
  their required `inspection_id`.
- Railway production and staging PostGIS databases are provisioned.
- GitHub Actions owns database migration deployment:
  - pushes to `staging` with migration-folder changes migrate the staging DB
  - pushes to `main` with migration-folder changes migrate the production DB
  - manual workflow dispatch can retry either environment from the matching
    branch
- GitHub Actions now has an app deployment pipeline for Railway:
  - pushes to `staging` verify, migrate, and deploy staging services
  - pushes to `main` verify, migrate, and deploy production services
  - server, web, and worker deploy as separate Railway services
- A manual sync baseline seed workflow can bootstrap the read-only tracer demo
  data for staging or production.
- The flattened migrations have been applied successfully to both Railway
  staging and production PostGIS databases.
- Adult surveillance domain command design has been grilled and recorded in
  `docs/adult-surveillance-domain.md`.
- `packages/domain` now exposes the hardened adult surveillance command
  vocabulary:
  - trap catalog commands
  - pending and collected collection workflow commands
  - ad hoc collection workflow commands
  - collection species count analysis commands
  - zero-result and bycatch commands
- Adult surveillance commands now use client-generated UUIDs where possible,
  separate collection transactions from analysis transactions, and model both
  exact timestamp timing and collection-date-plus-duration timing.
- Adult surveillance schema follow-up migration exists for:
  - `collection_timing_mode`
  - collection date and duration fields
  - stable `units.code`
  - `collections.has_bycatch`
- Kysely collection helper/types now understand the adult surveillance timing
  mode and bycatch schema changes.
- Larval surveillance domain command design has been grilled and recorded in
  `docs/larval-surveillance-domain.md`.
- `packages/domain` now exposes the hardened larval surveillance command
  vocabulary:
  - habitat catalog commands
  - habitat promotion and merge commands
  - cataloged and ad hoc inspection workflow commands
  - inspection result policy normalization with density inference
  - labeled and unlabeled sample workflow commands
  - sample zero-larvae, non-mosquito, and unidentifiable-result commands
  - sample species count analysis commands
- Larval surveillance commands now use client-generated UUIDs where possible,
  model organization inspection-entry defaults, and keep sample analysis
  separate from field inspection creation.
- Larval surveillance schema follow-up migration exists for:
  - positive `dip_count`
  - nonnegative `larvae_count`
  - `samples.has_non_mosquito`
  - soft-delete-aware active sample/species uniqueness
- Organization settings command design has been grilled and recorded in
  `docs/organization-settings-domain.md`.
- `packages/domain` now exposes the hardened organization settings
  command vocabulary and resolvers:
  - timezone
  - default units by unit type
  - larval inspection entry policy and density ranges
  - insecticide batch tracking preference
  - public engagement service request context defaults
- Control operations domain command design has been grilled and recorded in
  `docs/control-operations-domain.md`.
- `packages/domain` now exposes the hardened control operations command
  vocabulary:
  - control method catalog commands
  - vehicle and equipment catalog commands
  - insecticide, batch, formulation, and formulation helper commands
  - chemical application workflow commands
  - source reduction, outreach, and biocontrol action commands
  - requested control action commands
- Control operations and organization settings schema follow-up migration exists
  for:
  - `organizations.updated_by_profile_id`
  - vehicle/equipment active lifecycle
  - direct source reduction and requested control action habitat links
  - normalized control catalog uniqueness
  - active application batch and formulation component uniqueness
  - formulation numeric checks
- Foundation/reference-data domain command design has been grilled and recorded
  in `docs/foundation-domain.md`.
- `packages/domain` now exposes shared domain primitives and the hardened
  foundation/reference-data command vocabulary:
  - address create/update/location/delete/merge commands
  - region folder and region commands
  - SIMMER-operator genus/species taxonomy commands
  - organization species selection commands
  - organization collection method, collection lure, and habitat type commands
- Operational location-bearing domain commands now carry `locationSource`;
  server command handlers either map explicit GeoJSON geometry to
  `spatial_features.id` or snapshot an existing same-organization locatable
  record's `feature_id`. Foundation catalog commands may still use explicit
  geometry when they define the catalog feature itself.
- Foundation schema follow-up migration exists for:
  - organization species soft-delete selection lifecycle
  - normalized folder, lookup, genus, and species uniqueness
  - dropping region name uniqueness
  - dropping collection lure custom schema
- Public engagement domain command design has been grilled and recorded in
  `docs/public-engagement-domain.md`.
- `packages/domain` now exposes the hardened public engagement command
  vocabulary:
  - contact create/update/merge/delete commands
  - service request create/update/location/contact/close/reopen/delete commands
  - notification type catalog commands
  - notification registration lifecycle, location, buffer, flag, and
    subscription commands
  - mission notification generation and status commands
- Public engagement schema follow-up migration exists for:
  - removing fax from contacts and notification channels
  - normalized notification type name uniqueness
- Mission dispatch domain command design has been grilled and recorded in
  `docs/mission-dispatch-domain.md`.
- `packages/domain` now exposes the hardened mission dispatch command
  vocabulary:
  - mission create/details/schedule/plan/assignment/notification/lifecycle
    commands
  - mission item add/update/remove/reorder/progress commands
  - mission item execution helper commands for chemical applications, source
    reductions, outreach actions, and biocontrol actions
  - derived mission and mission item status helpers
- Mission dispatch schema follow-up migration exists for:
  - mutually exclusive mission terminal timestamps
  - mission item progress fields
  - actual control action `mission_item_id` provenance links
- Weather domain command design has been grilled and recorded in
  `docs/weather-domain.md`.
- `packages/domain` now exposes the hardened weather command vocabulary:
  - organization weather station create/update/location/deactivate/reactivate
    and cleanup delete commands
  - weather summary create/update/delete commands
  - station-scoped weather summary import commit commands
  - weather summary import assessment helpers
  - station status and date-bucket helpers
- Weather schema follow-up migration exists for:
  - summary audit profile fields
  - non-null explicit `end_date`
  - normalized weather station name/code uniqueness
  - summary metric sanity bounds
- `packages/domain/src` now keeps stable top-level public seams and moves
  larger implementations into matching domain folders. Control operations and
  public engagement are split by command group internally; other sizeable
  domains are folderized behind `index.ts` implementations for future splits.
- Domain unit tests now live in `packages/domain/src/tests`, and the
  `@simmer-mosquito/domain` test script targets that folder directly to avoid
  discovering compiled tests in `dist`.

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
tables. Adult surveillance, larval surveillance, shared field-work support,
organization settings, foundation/reference data, control operations, public
engagement, mission dispatch, and weather now have concrete domain command
vocabularies and schema direction. Server endpoints, import flows, sync
boundaries, and production UI remain to be built deliberately.

Deployment has a documented database and app-pipeline baseline for the clean
Railway reset:

- Railway environments should exist for staging and production.
- Both environments should use PostGIS-capable PostgreSQL services.
- GitHub environment secrets provide the public database URLs for migration CI
  once the new Railway resources are created.
- The DB migration workflow is intentionally migration-folder gated so app-only
  changes do not mutate database environments.
- The Railway deployment workflow verifies the workspace, applies idempotent
  dbmate migrations, and deploys server, web, and worker services for the
  branch-mapped environment.

Do not add a generic `sites` table yet. The old repo modeled concrete locatable
domain entities (`traps`, `habitats`, addresses, route items) rather than a
shared site abstraction. Keep that direction unless a concrete workflow proves
the abstraction is worth it.

## Recommended Next Slice

Build the read-only web sync tracer using ElectricSQL and TanStack DB.

This tracer proves the normal read path before adding optimistic command
mutations. It should establish the shared sync descriptor package, server
authorized Electric shape proxy, web collection registry, and org baseline
preload for eager collections. The table-level policy is captured in
`docs/sync.md`.

Vertical slices:

1. Seed baseline sync data.
   - Status: implemented for repeatable local/dev baseline fixture data.
   - Create a repeatable `packages/db` seed script for local/dev sync tracer
     data.
   - Cover one selected organization, profiles, units, global taxonomy,
     organization species, collection methods, collection lures, habitat types,
     tags, and routes.
   - Include inactive non-deleted lookup rows where historical display matters.

2. Sync units end to end.
   - Status: implemented as the first authenticated Electric/TanStack DB read
     path.
   - Add the thinnest full read path for global `units`.
   - Include a shared sync descriptor, server-authorized Electric proxy, web
     collection instance, and live-query rendering.

3. Sync selected-organization profiles.
   - Status: implemented with an authenticated server-scoped Electric proxy and
     web-owned TanStack DB collection.
   - Add selected-organization shape scoping.
   - Sync broad profile label fields for all roles.

4. Sync taxonomy and organization species.
   - Status: implemented with global taxonomy shapes and selected-organization
     `organization_species` scoping.
   - Add `genera`, `species`, and `organization_species`.
   - Prove a live query can combine organization species with global species
     labels.

5. Sync foundation lookup catalogs.
   - Status: implemented for selected-organization lookup catalog shapes.
   - Add `collection_methods`, `collection_lures`, and `habitat_types`.
   - Include inactive non-deleted rows for historical display.

6. Sync tags and route headers.
   - Status: implemented for selected-organization `tags` and `routes`;
     `route_items` remains out of scope.
   - Add eager selected-organization `tags` and `routes`.
   - Do not sync `route_items` in this tracer.

7. Wire org baseline preload.
   - Status: implemented with an explicit web eager-baseline preload bundle.
   - Create the web collection registry and org baseline preload bundle.
   - Preload eager collections with `collection.preload()`.
   - Do not call raw collection preload for future on-demand collections.

8. Document and guard the read-only tracer boundary.
   - Status: implemented with sync docs and a package-level read-only tracer
     guard.
   - Update docs with what shipped.
   - Keep TanStack DB optimistic mutations and Electric txid write confirmation
     deferred to the next tracer.

Acceptance criteria:

- Local/dev data can be seeded repeatably for the baseline sync tables.
- Local Electric smoke tests follow the port, offset, shape-cache, and
  multi-organization seed notes in `docs/sync.md`.
- Web can render synced data from TanStack DB collections through Electric,
  without bespoke REST list reads for the tracer tables.
- Selected-organization scoping is enforced by the server-authorized shape
  path.
- Eager baseline collections preload after auth/organization context is known.
- Mutations remain explicitly out of scope for this tracer.

Recommended follow-up slice:

- Add command-backed TanStack DB mutations for one eager collection, including
  optimistic state and Electric transaction-id confirmation. Mutation endpoints
  must commit through server-authorized domain commands and return the Electric
  txid from the same Postgres transaction.
- Expand on-demand read patterns for the first real workflow screen.

## Deferred

- Mobile auth/session token bridge.
- WorkOS event sync worker.
- Domain command package design is complete for the current schema groups.
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
