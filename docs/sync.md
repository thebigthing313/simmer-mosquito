# SIMMER sync policy

This document is the table-level matrix for Electric-backed TanStack DB
collections, and the policy behind it. It covers what each app baselines, what
it loads from screen predicates, and where the pieces live.

`apps/web` is migrated: all fifty-three of its tables read through
`apps/web/src/lib/collections`, and every write names the domain command it
means. `apps/mobile` has the same migration ahead of it, and its matrix below
is a plan rather than a description.

## Principles

- Electric-backed TanStack DB collections are the default read path for normal
  authenticated organization screens.
- Server query endpoints are reserved for auth/session, command writes, imports,
  SIMMER operator control-plane workflows, specialized reports/exports, and
  views that are genuinely hard or inappropriate to compute from synced client
  collections.
- **Eager** means the product is comfortable baselining the entire relevant
  rowset, usually the entire selected-organization rowset.
- **On-demand** means the app should load rows from active screen or workflow
  predicates instead of baselining the full table.
- **Progressive** means the app should become usable from an initial subset,
  then continue filling a broader collection in the background.
- Eager and on-demand are declared per app, not per package: each module under
  `apps/web/src/lib/collections` declares its own `syncMode`, and the source
  installed at startup passes it to the collection factory. The matrix below is
  what those fifty-three modules say, so a table that changes mode changes it
  there and this table follows. `collection-modules.test.ts` holds the two to
  each other, so the matrix is checked rather than maintained by hand.
- Web is online-only in v1. Mobile uses automatic scoped offline persistence.

## Web matrix

Twenty-four eager, twenty-nine on-demand.

| Area | Eager | On-demand | Excluded |
| --- | --- | --- | --- |
| Identity | `organizations` (the organization's own row), `memberships`, `profiles` for selected org | none | `users` |
| Foundation | `units`, `species`, `organization_species`, `collection_methods`, `collection_lures`, `habitat_types`, `region_folders` | `regions`, `addresses` | `genera` |
| Adult surveillance | `traps` | `collections`, `collection_species` | none |
| Larval surveillance | none | `habitats`, `inspections`, `samples`, `sample_species` | none |
| Field-work support | `tags`, `routes` | `tag_items`, `comments`, `additional_personnel`, `route_items`, `assignments`, `assignment_items` | none |
| Control operations | `application_methods`, `source_reduction_methods`, `outreach_methods`, `biocontrol_methods`, `vehicles`, `equipment`, `insecticides`, `formulations`, `formulation_insecticides` | `applications`, `application_batches`, `insecticide_batches`, `source_reductions`, `outreach_actions`, `biocontrol_actions`, `requested_control_actions` | none |
| Public engagement | `notification_types` | `contacts`, `service_requests`, `notification_registrations`, `notification_registration_types`, `mission_notifications` | none |
| Mission dispatch | none | `missions`, `mission_items` | none |
| Weather | `weather_sources` | `weather_summaries` | `weather_source_subscriptions` |

**Excluded** here means no collection module exists, so nothing in `apps/web`
reads the table through sync. `users` is read through the server. `genera` is
excluded because `species` already carries the genus name every surface asks
for.

`search_documents` is in none of the three columns, because it is not a table a
client reads at all. It is a derived index, maintained by triggers on the
thirteen tables it is projected from and read only by `GET /search`. It has no
collection module and no sync shape on purpose: Electric manages its own
publication and adds a table when a shape asks for it, so a table nothing syncs
never enters the replication stream and costs the slot nothing. What it holds is
gated by `pnpm check:search-corpus`, which refuses any column sync itself
withholds.

## Web notes

- Server shape routes must force their authorized table, columns, and scope
  server-side. The proxies preserve Electric stream parameters such as
  `offset`, `handle`, and `live`, but ignore caller-provided `table`, `columns`,
  and `where` query parameters.
- `profiles` sync is selected-organization only. Broad profile sync exposes
  stable label fields: profile id, organization id, display name, active state,
  and timestamps. Profile email and user id are reserved for role-appropriate
  management views.
- `region_folders` is eager, but `regions` is on-demand because organizations
  may store complex administrative boundary polygons.
- `addresses` is on-demand because address books can be large.
- Owned geometry lives on the locatable rows themselves. It is not a standalone
  web collection. Each locatable table carries trigger-maintained centroid
  columns (`lat`, `lng`, `geom_type`) that Electric may stream, so pins and
  coordinate reads come straight off the synced row. The raw `geom` and the
  generated `geojson` stay server-only and are read through the `/map/*`
  endpoints. That exclusion is enforced by type rather than by convention:
  `ClientOmitted` in `packages/sync/src/tests/unit/collections/tables/drift.test.ts`
  drops `geom`, `geojson`, `deleted_at`, and `deleted_by_profile_id` from every
  table's schema, and errors on any other column a schema fails to cover. A
  table that withholds a fifth column declares it in `WITHHELD` in
  `scripts/withheld-columns.mjs`, which generates both halves. See
  `organizations`, which keeps its billing and subscription columns.
- `memberships` is eager for the role ladder, and that reason covers `role`,
  `status` and `profile_id` only. It withholds `invited_email` and
  `workos_invitation_id`: an invited address belongs to somebody who has not
  accepted yet, and `workos_invitation_id` is a handle on a live grant in
  WorkOS. The handlers that need either read it server-side inside the
  transaction, and the operator console reads both over REST. Withheld is about
  what a client *receives*: the invite dialog sends `invited_email` and
  `/commands/memberships` writes it. The command payload type takes its columns
  from `packages/db/src/tables.ts` rather than from these schemas, so a withheld
  column stays writable without a second list saying so.
- Region membership is computed on read and never stored, so there is no table
  to sync. `GET /records/:recordType/:recordId/regions` answers it. See ADR 0015
  and `docs/region-membership-spec.md`.
- `route_items` is on-demand because large habitat catalogs can make route
  membership very large, and the same habitat may appear in multiple routes.
- `requested_control_actions` is on-demand because the app should not assume it
  can baseline the full organization rowset.

## The read path

Every normal authenticated read runs:

`Postgres -> Electric -> server-authorized shape proxy -> TanStack DB collection -> web UI`

Who owns which leg:

- `packages/db` owns the migrations that are the source of truth for every
  column, and repeatable sync baseline seed data for local/dev smoke tests.
- `packages/sync` owns the per-table row schemas generated from those
  migrations, key extraction, the collection factory, and the write path that
  turns a mutation into a named domain command.
- `apps/server` owns authenticated shape proxy routes and forces table,
  columns, and organization scope server-side.
- `apps/web` owns the fifty-three collection declarations under
  `src/lib/collections`, their `syncMode`, and the surface-shaped read hooks
  under `src/hooks/queries` that join them. Route components read hooks, not
  collections.

Writes take the mirror path. A mutation applied optimistically to a collection
carries the domain command it means; the server validates that command, commits
it in one Kysely transaction, and returns `pg_current_xact_id()` from the same
transaction so Electric can confirm the optimistic write. The server never
infers the command from which fields changed.

### Where a collection comes from

A module in `apps/web/src/lib/collections` names the factory from
`packages/sync`, its `syncMode`, and whether this app writes the table. It does
not call the factory. `main.tsx` installs the sync-backed source before the
first render, and the registry builds each collection the first time a hook asks
for it, so importing a hook opens no shape stream and needs no server URL. A
test installs a memory-backed source instead, which is how `apps/web` tests a
read at all. See `lib/collections/registry.ts`.

## Mutation confirmation and transaction IDs

TanStack DB applies collection mutations optimistically before the async
mutation handler completes. The handler must always await the authoritative
server command response so real validation, authorization, network, and database
write failures reject the transaction.

Returning `{ txid }` from an Electric-backed mutation handler adds a second
confirmation step: TanStack waits for that transaction ID to appear in the
collection's Electric shape stream before resolving `tx.isPersisted.promise`.
That is a read-your-write-through-sync guarantee, not merely a write-success
guarantee. The Electric collection adapter defaults this wait to 5 seconds, and
a timeout rejects the transaction even when the command already committed.

The default product policy is that users should not see Electric catch-up lag as
a save failure. Treat the awaited server command response as the user-facing
persistence boundary. If a handler wants to observe Electric catch-up, await the
transaction ID manually with `collection.utils.awaitTxId(...)`, catch timeout
errors, and report them as console warnings or internal telemetry rather than
Sonner toasts:

```ts
onInsert: async ({ transaction, collection }) => {
	const txids = await Promise.all(
		transaction.mutations.map(async (mutation) => {
			const result = await writeThing(toPayload(mutation.modified));
			return result.txid;
		}),
	);

	void Promise.all(
		txids.map((txid) =>
			collection.utils.awaitTxId(txid, 5000).catch((error) => {
				if (error?.name === 'TimeoutWaitingForTxIdError') {
					console.warn('[sync] Timed out waiting for Electric txid catch-up', {
						collection: collection.id,
						txid,
					});
					return;
				}

				console.warn('[sync] Electric txid catch-up failed', error);
			}),
		),
	);
};
```

Do not return `{ txid }` for on-demand, filtered, subset-limited, or route-owned
shapes unless the UI explicitly needs `tx.isPersisted.promise` to mean "the
synced read model has caught up." In most collection handlers, returning
`undefined` after the server command succeeds is cleaner: it lets TanStack drop
pending optimistic state after the committed write while Electric refreshes or
canonicalizes the row later.

A table with no write surface is read-only by having no commands mapped to it,
not by a separate class of collection. `apps/server/src/table-commands` is
where a table declares the intents its route accepts; a table absent from it
accepts no writes at all.

The two halves of a write are declared apart. The intent map says which
commands the route accepts, and the domain module's `write*Command` says which
it knows how to write, so `writer-coverage.test.ts` asserts they agree. Without
it the gap is invisible: the map compiles, the route registers, the permission
check passes, and the write falls through the writer's `switch` to a 500 that
names neither half.

## Local Electric testing notes

These notes cover the fully-local Docker mode, which is the only local mode.
See `docs/deployment.md`, "Local development".

- Docker Compose exposes Postgres on `localhost:55432`, not `localhost:5432`,
  so local `.env` files for this repo should use
  `postgres://postgres:postgres@localhost:55432/simmer_mosquito?sslmode=disable`.
  The nonstandard host port avoids colliding with a developer's separately
  installed Postgres on `5432`.
- Electric is exposed at `http://localhost:3001/v1/shape`. The compose service
  still connects to Postgres through the Docker network at
  `postgres://postgres:postgres@postgres:5432/simmer_mosquito?sslmode=disable`.
- Direct `Invoke-WebRequest`/curl probes against Electric must include an
  Electric offset parameter, usually `offset=-1`, for the initial shape request.
  TanStack DB's Electric adapter supplies the normal stream parameters itself,
  but bare manual requests without `offset` return an Electric validation error.
- Seed local sync smoke data before opening a long-lived Electric shape for that
  table/scope. Electric persists shape state in its storage volume, so a manual
  shape created before later seed rows may need a fresh shape request, service
  restart, or cleared `electric-data` volume to avoid confusing a smoke test.
- The baseline seed can populate multiple organizations by setting
  `SIMMER_SYNC_BASELINE_ORGANIZATION_ID`. Use this to verify selected-org shapes
  do not leak one org's rows into another. Global tables such as `units`,
  `genera`, and `species` intentionally return the same rows for every org.
- The applied migrations are the source of truth for every synced column, and
  the row schemas are scaffolded from them by
  `scripts/generate-table-schemas.mjs` rather than written from nothing. Which
  columns are in a schema is that script's decision; the zod expression beside
  each one, the order and the prose are a person's, and a second run adds and
  removes field lines in place rather than writing the file over. A column a
  migration adds, renames, or drops fails the drift check until the schema is
  regenerated, so the two cannot disagree quietly, and `pnpm check:schemas`
  fails on the same thing without waiting for a build.
- A full browser smoke requires an authenticated WorkOS session, because app
  shape routes are protected by the selected-organization auth context.

## Deployed Electric notes

- Web clients never call Electric directly in any environment. They call the
  server's authenticated `/sync/shapes/*` routes, and the server proxies to
  Electric. The server forces the table/columns/where/params and strips any
  caller-supplied ones.
- Electric is private in every environment (see `docs/deployment.md`):
  `electric.railway.internal:3000` with `ELECTRIC_INSECURE=true` on Railway, and
  `localhost:3001` with the same setting under `docker-compose.yml`. No
  environment gives it a public domain.
- The server still reads `ELECTRIC_SECRET` and folds it into `ELECTRIC_URL` as a
  `secret` query param on every upstream request (`readElectricUrl` in
  `apps/server/src/env.ts`); `secret` is a server-owned shape param. Nothing sets
  the variable now, so the forwarding is inert everywhere.
- Railway `ELECTRIC_URL` is the full internal shape endpoint
  `http://electric.railway.internal:3000/v1/shape` in both environments.
- Electric requires Postgres logical replication. For the current PostGIS
  Railway service, enable `wal_level = logical`, `max_replication_slots = 10`,
  and `max_wal_senders = 10`, then restart Postgres and Electric.
- DB clients must commit writes before Electric can stream them. In DBeaver,
  either enable Auto-commit or explicitly commit after inserts/updates; otherwise
  rows may appear locally, then disappear when the connection refreshes.
- Production and staging were smoke tested on 2026-05-16 by inserting committed
  `public.units` rows and observing them render live in the signed-in web app
  without a manual page refresh.

## Mobile matrix

Mobile offline persistence is automatic and scoped. The field app persists
field-critical data after sign-in, then persists additional work-scoped data as
users load or receive it. It should not attempt to persist the entire
organization database.

| Area | Mobile policy |
| --- | --- |
| Traps | eager and persisted |
| Habitats | progressive and persisted, eventually full selected-org habitat catalog |
| Routes / route items | progressive and persisted |
| Addresses | progressive and persisted |
| Owned geometry | persisted with the locatable records already persisted on the device |
| Regions / region folders | on-demand, user-selected downloads |
| Adult collections | three-year persisted history, older on request |
| Collection species | persisted with loaded parent collections |
| Larval inspections | three-year persisted history, older on request |
| Samples / sample species | persisted with loaded parent inspections/detail workflows |
| Control catalogs | eager and persisted |
| Performed control actions | three-year persisted history, older on request |
| Application batches | persisted with loaded applications |
| Requested control actions | unresolved persisted automatically; resolved uses three-year history window |
| Service requests | three-year persisted history |
| Assignments / assignment items | three-year persisted history |
| Contacts | dependency-loaded and persisted for persisted service requests and notification workflows |
| Comments / tag items / additional personnel | persist when loaded for persisted target records |
| Missions / mission items | three-year persisted history |
| Notifications | outside mobile field-work scope |
| Weather | `weather_sources` may be eager; `weather_summaries` on-demand |

## Mobile notes

- Mobile history windows are based on domain operational dates, not audit
  `created_at` timestamps. Examples include collection dates/times, inspection
  dates, performed control action dates, and requested-action timestamps.
- Retention/pruning of older persisted rows is an explicit SIMMER sync concern,
  not assumed to be automatic TanStack DB persistence behavior.
- Sync config should record rolling-window policies, and cleanup must not prune
  rows with pending local mutations.
- Owned geometry is scoped by the table row that carries it. Mobile should not
  expect a shared geometry collection to load separately.
- Users can choose region context to load onto the device when needed because
  folders such as parks or administrative boundaries may contain thousands of
  complex polygons.
- Notification workflows are outside mobile field-work scope. Mobile does not
  baseline `notification_registrations`, `notification_registration_types`, or
  `mission_notifications`.

## Package boundary

`packages/sync` owns what is true of a table everywhere; each frontend owns
what is true of a table in that app. The split is what lets `apps/mobile` reach
the same rows on a different sync policy without a second copy of the schema.

`packages/sync` provides:

- per-table row schemas generated from the migrations, in
  `src/collections/tables`, with `getKey` for each;
- the collection factory in `src/collections/functions/sync-collection.ts`,
  which takes the app's `syncMode` rather than declaring one;
- the write path in `src/collections/functions` (`mutate-collection.ts`,
  `command-request.ts`, and `command-transaction.ts`), which turns a mutation
  into a named domain command and settles the response;
- shared helpers for Electric transaction-id mutation handling.

`apps/web` owns:

- the fifty-three collection declarations in `src/lib/collections`, one per
  table, each naming its own `syncMode`;
- the read seam in `src/hooks/queries`, one hook per surface, joining
  collections and returning camelCase;
- the explicit eager baseline preload bundle and route live-query preloads.

What deliberately does **not** live in `packages/sync`: sync mode, preload
policy, and retention windows. All three are app decisions, and a package that
declared them would be making mobile's for it.

The web eager baseline bundle must stay explicit. Components should subscribe to
collection changes, but should not individually call `collection.preload()` as a
side effect of rendering because future on-demand collections must not be
accidentally promoted into app-wide baseline sync.

`apps/mobile` should create persisted mobile collection singletons and own
mobile progressive sync, download, and retention behavior.
