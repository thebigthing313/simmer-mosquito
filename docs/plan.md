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

Deployment now has a working database baseline:

- Railway environments exist for staging and production.
- Both environments use PostGIS-capable PostgreSQL 16 services.
- GitHub environment secrets provide the public database URLs for migration CI.
- The DB migration workflow is intentionally migration-folder gated so app-only
  changes do not mutate database environments.

Do not add a generic `sites` table yet. The old repo modeled concrete locatable
domain entities (`traps`, `habitats`, addresses, route items) rather than a
shared site abstraction. Keep that direction unless a concrete workflow proves
the abstraction is worth it.

## Recommended Next Slice

Build the server-authorized command spine using adult surveillance as the first
tracer bullet.

Suggested scope:

- Apply and verify the domain schema update migrations locally, including the
  public engagement and mission dispatch catch-up migration.
- Add a small reusable command endpoint pattern in `apps/server`:
  - AuthContext resolution for command requests
  - domain command payload validation
  - consistent command error responses
  - transaction wrapper and audit profile plumbing
  - same-organization reference checks
- Add Kysely helpers for adult surveillance:
  - collection species count create/update/delete
  - collection zero-result and bycatch updates
  - pending collection cancellation
  - collection soft-delete cascades
  - trap retire/reactivate/delete lifecycle
- Add Hono command endpoints behind `AuthContext` for the hardened
  `adultSurveillance.*` command vocabulary.
- Enforce same-organization consistency in the server layer for trap,
  collection method, lure, address, profile, species, unit, and spatial feature
  references.
- Enforce adult surveillance permission rules:
  - trap management is manager-and-above
  - collection method/lure management is owner/admin
  - collection workflow is collector-and-above
  - collectors can only act on behalf of themselves
  - manager-and-above can backfill on behalf of another profile
- Enforce workflow invariants:
  - trap/ad hoc adult collection features are points
  - pending trap collections block duplicate pending sets
  - species counts require collected records
  - zero result is mutually exclusive with active species rows
  - bycatch can coexist with zero result or species rows
  - collector edits are limited to their own records within 30 days of
    collection
- Keep larval command handling out of this first tracer bullet, but design the
  command spine so larval can reuse the same AuthContext, transaction, command
  error, audit, and reference-validation patterns next.
- Keep the existing admin foundation UI as a smoke-test surface, but avoid
  expanding it into the product workflow.
- Add integration tests around the command handlers using a migrated PostGIS
  test database.
- Use `docs/organization-settings-domain.md` as the source of truth for
  resolving organization settings in command handlers. Larval handlers should
  load current settings from Postgres, resolve them server-side, and revalidate
  queued command intent before writing.

Acceptance criteria:

- An agency manager can create, update, retire, reactivate, and delete traps
  through command endpoints.
- An agency collector can set and collect trap/ad hoc collections through
  command endpoints.
- An agency collector can enter and correct their own species count analysis
  inside the 30-day window.
- Cross-org IDs and disabled/inactive references are rejected by the command
  layer.
- Adult surveillance timing modes, zero-result, and bycatch behavior are
  enforced server-side.
- The command handler pattern is documented enough that the larval surveillance
  endpoints can follow it without a second architecture debate.
- The workflow runs locally and against the migrated staging database.

Recommended follow-up slice:

- Build server-authorized larval surveillance command handling using the adult
  command spine.
- Start with habitat catalog and inspection commands before sample analysis and
  merge/delete edge cases.
- Add integration tests for density policy resolution, ad hoc inspection
  behavior, sample creation constraints, and `has_non_mosquito` persistence.

## Deferred

- Mobile auth/session token bridge.
- WorkOS event sync worker.
- Domain command package design is complete for the current schema groups.
- Electric shape authorization.
- TanStack DB optimistic mutations.
- Railway app service deploy pipelines for server, worker, and web.
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
