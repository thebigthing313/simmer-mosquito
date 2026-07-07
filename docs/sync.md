# SIMMER Sync Policy

This document captures the initial sync policy for SIMMER web and mobile apps.
It is the working table-level matrix for Electric-backed TanStack DB
collections. Shape design, query predicates, and concrete collection
implementation remain separate implementation work.

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
- Web is online-only in v1. Mobile uses automatic scoped offline persistence.

## Web Matrix

| Area | Eager | On-demand / excluded |
| --- | --- | --- |
| Identity | `profiles` for selected org, label fields for all roles | `users` no sync; `organizations` no normal app collection; `memberships` API/control-plane |
| Foundation | `units`, `genera`, `species`, `organization_species`, `collection_methods`, `collection_lures`, `habitat_types`, `region_folders` | `regions`, `addresses`, region intersection cache data |
| Adult surveillance | `traps` | `collections`, `collection_species` |
| Larval surveillance | none | `habitats`, `inspections`, `samples`, `sample_species` |
| Field-work support | `tags`, `routes` | `tag_items`, `comments`, `additional_personnel`, `route_items`, `assignments`, `assignment_items` |
| Control operations | `application_methods`, `source_reduction_methods`, `outreach_methods`, `biocontrol_methods`, `vehicles`, `equipment`, `insecticides`, `insecticide_batches`, `formulations`, `formulation_insecticides` | `applications`, `application_batches`, `source_reductions`, `outreach_actions`, `biocontrol_actions`, `requested_control_actions` |
| Public engagement | `notification_types` | `contacts`, `service_requests`, `notification_registrations`, `notification_registration_types`, `mission_notifications` |
| Mission dispatch | none | `missions`, `mission_items` |
| Weather | `weather_sources` | `weather_source_subscriptions` excluded; `weather_summaries` on-demand |

## Web Notes

- The first read-only tracer shapes are `units`, selected-organization
  `profiles`, taxonomy, organization species, foundation lookup catalogs, tags,
  and route headers. `packages/sync` defines shared row contracts and
  descriptors, `apps/server` exposes authenticated Electric proxy routes, and
  `apps/web` owns the concrete TanStack DB collection instances.
- Server shape routes must force their authorized table, columns, and scope
  server-side. The proxies preserve Electric stream parameters such as
  `offset`, `handle`, and `live`, but ignore caller-provided `table`, `columns`,
  and `where` query parameters.
- `profiles` sync is selected-organization only. Broad profile sync exposes
  stable label fields: profile id, organization id, display name, active state,
  and timestamps. Profile email and user id are reserved for role-appropriate
  management views.
- `region_folders` is eager, but `regions` is on-demand because agencies may
  store complex administrative boundary polygons.
- `addresses` is on-demand because address books can be large.
- Owned geometry lives on the locatable rows themselves. It is not a standalone
  web collection. Each locatable table carries trigger-maintained centroid
  columns (`lat`, `lng`, `geom_type`) that Electric may stream, so pins and
  coordinate reads come straight off the synced row. The raw `geom` and the
  generated `geojson` stay server-only and are read through the `/map/*`
  endpoints (`packages/sync` forbids `geom`/`geojson` in any shape descriptor).
- Region intersection cache data is derived GIS data and is not part of normal
  app sync unless a specific reporting/GIS screen proves it needs direct client
  access.
- `route_items` is on-demand because large habitat catalogs can make route
  membership very large, and the same habitat may appear in multiple routes.
- `requested_control_actions` is on-demand because the app should not assume it
  can baseline the full organization rowset.

## Read-only Web Tracer

The first web sync tracer is intentionally read-only. It proves the normal
authenticated read path:

`Postgres -> Electric -> server-authorized shape proxy -> TanStack DB collection -> web UI`

Shipped pieces:

- `packages/db` owns repeatable sync baseline seed data for local/dev smoke
  tests.
- `packages/sync` owns row contracts, descriptor columns, key extraction, and
  Electric collection option creation.
- `apps/server` owns authenticated shape proxy routes and forces table,
  columns, and tenant scope server-side.
- `apps/web` owns concrete collection singletons, the explicit eager baseline
  preload bundle, and the current signed-in smoke rendering panels.

Current command-backed tracer descriptor set:

- selected-organization `collection_methods`
- selected-organization `collection_lures`
- selected-organization `habitat_types`

The foundation lookup catalogs are the first optimistic mutation tracers. Web
inserts, updates, and deletes go through TanStack DB mutation handlers, then
through authenticated server foundation command routes. The server validates the
matching foundation domain command, commits with Kysely, and returns
`pg_current_xact_id()` from the same transaction so Electric can confirm the
optimistic write.

### Mutation confirmation and transaction IDs

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

Current read-only tracer descriptor set:

- global `units`
- selected-organization `profiles`
- global `genera`
- global `species`
- selected-organization `organization_species`
- selected-organization `application_methods`
- selected-organization `source_reduction_methods`
- selected-organization `outreach_methods`
- selected-organization `biocontrol_methods`
- selected-organization `vehicles`
- selected-organization `equipment`
- selected-organization `notification_types`
- selected-organization `tags`
- selected-organization `routes`

Collections in the read-only set deliberately exclude TanStack DB optimistic
mutation handlers, domain command endpoints, and Electric transaction-id
confirmation. Their collection options should not provide `onInsert`,
`onUpdate`, or `onDelete`.

## Local Electric Testing Notes

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
  do not leak org-owned rows across tenants. Global tables such as `units`,
  `genera`, and `species` intentionally return the same rows for every org.
- Treat the current Kysely table types and applied migrations as the source of
  truth for sync descriptor columns. Earlier domain drafts used fields such as
  `organization_species.display_name_override` and lookup `sort_order`, but the
  current schema removed those columns.
- The read-only tracer currently proves direct Electric shape behavior and the
  server proxy unit tests. A full browser smoke still requires an authenticated
  WorkOS session because app shape routes are intentionally protected by the
  selected-organization auth context.

## Deployed Electric Notes

- Deployed web clients do not call Electric directly. They call the server's
  authenticated `/sync/shapes/*` routes, and the server proxies to Electric over
  Railway private networking.
- Railway `ELECTRIC_URL` for the server should include the full shape endpoint:
  `http://electric.railway.internal:3000/v1/shape`.
- Electric requires Postgres logical replication. For the current PostGIS
  Railway service, enable `wal_level = logical`, `max_replication_slots = 10`,
  and `max_wal_senders = 10`, then restart Postgres and Electric.
- DB clients must commit writes before Electric can stream them. In DBeaver,
  either enable Auto-commit or explicitly commit after inserts/updates; otherwise
  rows may appear locally, then disappear when the connection refreshes.
- Production and staging were smoke tested on 2026-05-16 by inserting committed
  `public.units` rows and observing them render live in the signed-in web tracer
  without a manual page refresh.

## Mobile Matrix

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

## Mobile Notes

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

## Package Boundary

The current expectation is that `packages/sync` owns shared row contracts and
sync descriptors, while each frontend owns concrete collection instances.

`packages/sync` should provide:

- row schemas and parsers;
- `getKey` functions;
- table and shape descriptors;
- dependency relationships such as `address_id` plus owned geometry projection
  columns;
- web and mobile policy descriptors;
- retention metadata for rolling windows;
- shared helpers for Electric transaction-id mutation handling.

`apps/web` should create web collection singletons and own web preload bundles
and route live-query preloads.

The web eager baseline bundle must stay explicit. Components should subscribe to
collection changes, but should not individually call `collection.preload()` as a
side effect of rendering because future on-demand collections must not be
accidentally promoted into app-wide baseline sync.

`apps/mobile` should create persisted mobile collection singletons and own
mobile progressive sync, download, and retention behavior.
