# Deployment runbook

SIMMER has three operating environments:

- **local development**: `apps/server` and the frontends run on your machine.
  Postgres + Electric come from **either** the Railway `staging` environment
  (recommended default) **or** local Docker Compose. See "Local development".
- **staging** on Railway, deployed from the `staging` branch.
- **production** on Railway, deployed from the `main` branch.

The deployed Railway shape is one project with separate `staging` and
`production` environments. Each environment should have these services:

- Postgres with PostGIS;
- ElectricSQL;
- `server`;
- `admin`;
- `web`.

Use a PostGIS-capable PostgreSQL service for the database. Use an image-based
service for ElectricSQL with the `electricsql/electric:latest` image.

The current deployed domains are:

| Environment | Web | Admin | Server |
| --- | --- | --- | --- |
| Production | `https://app.simmer-data.com` | `https://admin.simmer-data.com` | `https://api.simmer-data.com` |
| Staging | `https://staging.simmer-data.com` | `https://admin-staging.simmer-data.com` | `https://api-staging.simmer-data.com` |

The admin service runs in **Serverless** mode in both environments; see "Admin
service (Serverless)". Note its Railway service name differs per environment
(`admin` in staging, `admin-prod` in production).

In every environment, browsers never call Electric directly. They call the Hono
server's authenticated `/sync/shapes/*` routes and the server proxies to Electric.
Electric's networking differs per environment:

- **production**: Electric is **private** (`electric.railway.internal:3000`) and
  runs `ELECTRIC_INSECURE=true`. Only the co-located prod server reaches it.
- **staging**: Electric has a **public domain** and is secured with
  `ELECTRIC_SECRET` (not `ELECTRIC_INSECURE`). The public domain existed so a
  locally-run server could reach it; local dev no longer points at staging, so
  nothing outside the staging server needs it and it could follow production
  private. Left as is here rather than changed in passing. See "Electric
  service" for the exact settings.

## Local development

Everything runs on your machine: `apps/server` + the frontends with HMR, and
Postgres + Electric from `docker-compose.yml`. `apps/server` reads env from
`apps/server/.env`; Vite reads from the repo-root `.env` (its `envDir` is the
workspace root). Keep the shared keys in sync across both files.

**Nothing local points at Railway.** Staging is a sandbox agency staff are
signed into to try upcoming features against a clone of their own data, so a
local `pnpm dev:server` writing to it corrupts their test. There is no
documented escape hatch back to it, because an escape hatch aimed at a
user-facing environment is one `pnpm dev:server` away from being used by
accident. Local data comes from a prod clone instead; see "Cloning production
data".

Run the apps with `pnpm dev`, which starts them all in an
[mprocs](https://github.com/pvolok/mprocs) TUI (`mprocs.yaml`): `server`, `web`,
`admin`, and `caddy`, each in its own pane. Tab switches panes, `r` restarts the
focused process, `s` stops/starts it, `q` quits everything. Individual scripts
(`pnpm dev:server`, `dev:web`, `dev:admin`, `dev:caddy`) still work when you want
one on its own.

Caddy (`Caddyfile.local`) is the browser-facing front for all three:

| Origin | Proxies | Serves |
| --- | --- | --- |
| `https://localhost:5175` | `5173` | web |
| `https://localhost:5176` | `5174` | admin |
| `https://localhost:3002` | `3000` | server + shape streams |

HTTP/2 is the reason it exists: Electric sync opens many concurrent shape
requests and HTTP/1.1 caps a browser at ~6 per origin, so without it streams
queue and the workspace stalls. **Use the Caddy origins in the browser, not the
Vite ports.** `APP_ORIGIN`, `ADMIN_APP_ORIGIN`, `VITE_SERVER_URL`, and
`VITE_SHAPE_SERVER_URL` are all set to them, and the server matches the first two
against the request origin for CORS. Hitting `http://localhost:5174` directly
puts the console on an origin the server does not allow, and every `/admin/*`
call fails CORS.

### Backing services

Postgres and Electric come from `docker-compose.yml` and nothing else:

```sh
docker compose up -d postgres electric
pnpm db:migrate
pnpm --filter @simmer-mosquito/db seed:sync-baseline
```

Use the `.env.example` values: Postgres on `localhost:55432`, Electric on
`localhost:3001`, and `ELECTRIC_SECRET` **unset**, because the local Electric
runs `ELECTRIC_INSECURE=true`. A `DATABASE_URL` or `ELECTRIC_URL` pointing at
`*.proxy.rlwy.net` or a Railway domain is a mistake, not a mode.

Two settings in `docker-compose.yml` are load-bearing and a hand-started
container has neither. `max_locks_per_transaction=1024`, because the integration
harness builds a throwaway schema per test and applies the whole migration set
into each, several files at a time, and the stock 64 fails a dozen files at once
with `out of shared memory`. And `scripts/postgres-test-extensions.sql`, mounted
into `docker-entrypoint-initdb.d`, which creates `postgis`, `pgcrypto`,
`pg_trgm` and `btree_gin` in `public` on an empty data volume so the migrations'
`create extension if not exists` is the no-op they expect.

Electric holds a replication slot named `electric_slot_default` on that same
container, and the Postgres integration suites refuse to run while any slot
exists (#166, #236). Drop it when you want to run them:

```sh
docker compose exec -T postgres psql postgres://postgres:postgres@localhost:5432/simmer_mosquito   -c "select pg_drop_replication_slot('electric_slot_default');"
```

Electric recreates it on its next boot, so it costs one re-snapshot.

## Cloning production data

Two scripts, one dump shape, different targets. **`scripts/clone-prod-db.ps1` is
the one local dev uses**; `scripts/refresh-staging.ps1` is what refreshes the
sandbox. Both only ever READ from prod (`pg_dump`).

They differ in two ways beyond the target, and both differences follow from
which WorkOS environment signs you in. Local dev authenticates against WorkOS
**staging**, so the local clone relinks the production identity ids the dump
carries and keeps three years of history. Staging authenticates against WorkOS
**production** (#377), so the staging refresh relinks nothing and keeps every
row prod has.

### Into local Docker

```powershell
$env:PROD_DATABASE_URL = '<prod public proxy URL>'   # *.proxy.rlwy.net, read-only role preferred
./scripts/clone-prod-db.ps1
./scripts/clone-prod-db.ps1 -YearsOfHistory 5        # keep more
./scripts/clone-prod-db.ps1 -AllHistory              # keep everything
```

The restore target is the compose container's own Postgres, hard-coded, so this
one cannot be pointed at a remote host. It needs no local pg client tools: every
`pg_dump`, `pg_restore` and `psql` runs inside the container. Electric is stopped
before the database is recreated and its storage volume is cleared afterwards,
so it re-snapshots from a clean slate.

After the restore it runs the same two passes the staging clone does: the
**history prune** (below) and the **WorkOS relink** (below that). The relink is
the local script's, and it is not optional in practice: the dump carries
production WorkOS ids, local dev signs in against WorkOS **staging**, and an
unrelinked row is invisible to that session.

Run `pnpm db:migrate` afterwards. The dump carries prod's schema, which is
behind whatever you are building.

### Refreshing the staging sandbox

`scripts/refresh-staging.ps1` is the whole job, run on demand rather than on a
schedule. Three steps, and the first one is a gate:

1. **The schema gate.** Prod and staging must already hold the same schema and
   the same applied migrations. Read-only on both sides, via
   `check-schema-drift.mjs --pairwise`; a refusal touches nothing.
2. **The clone.** `scripts/clone-prod-to-staging.ps1`, prod's whole history.
3. **The migrations.** `dbmate up` against staging, so anything the reload
   rolled back comes back.

```powershell
git checkout staging
$env:PROD_DATABASE_URL    = '<prod public proxy URL>'      # *.proxy.rlwy.net, read-only role preferred
$env:STAGING_DATABASE_URL = '<staging public proxy URL>?sslmode=disable'
./scripts/refresh-staging.ps1
```

**The gate is the reason this is one script and not three commands.** Staging
holds migrations prod has not seen, by design, because that is what a soak is. A
dump carries prod's `schema_migrations` along with prod's schema, so a clone
taken mid-soak erases every unshipped migration and leaves the deployed staging
branch running against a schema behind it. That failure is silent — the app
starts answering wrong rather than erroring — so the refusal has to come before
the wipe. A refresh is therefore only safe **just after a promotion**, when
`main` has shipped everything `staging` holds. It refuses the rest of the time,
naming what diverged.

Two other refusals. The run has to start from a checkout of `origin/staging`,
because step 3 applies the migration set of whatever branch you are standing on
and doing that from `develop` would push staging's database ahead of the code
deployed on it. And the two URLs must differ and must be public proxy hosts.

**Leave staging's Electric running throughout.** The clone resets the target
with `DROP SCHEMA public CASCADE` rather than `DROP DATABASE`, so the replication
slot survives and no exclusive access is needed. Running is not merely tolerable
but required: staging caps `max_slot_wal_keep_size` at 2048MB where prod is
`-1`, the restore writes about a gigabyte of WAL against that ceiling, and a
stopped Electric stops advancing its slot until Postgres invalidates it (#371,
and #166 for what an invalidated slot costs). Redeploy Electric **after** the
refresh for a clean re-snapshot; its stored shape state predates the reload.

Nothing relinks WorkOS ids here. Staging authenticates against WorkOS
production, so the ids the dump carries are the ones staging wants. Signing in
afterwards as a production identity and landing in the right agency is the check
that the reload reached `users` and `organizations`.

The daily `schema-drift.yml` run stays. It answers a different question — has
staging drifted from the migration set — and a refresh that runs a few times a
year is no substitute for asking every morning.

### How much history a local clone keeps

Prod carries operational records back to 2011: roughly half a million
inspections and two hundred thousand applications. A local clone exists to make
dev realistic, which three years of history does as well as fifteen, against a
database that syncs, re-snapshots, and restores in a fraction of the time.

So the **local** clone keeps the **last 3 years of dated records** by default and
**all reference data**. The staging sandbox keeps everything: the trim is not a
saving there, because the dump and the restore run at full volume either way and
the prune is 1.17M deletes and eleven full-table rewrites on top (#371). Dated means the things an agency performs: inspections,
applications, collections, biocontrol and source-reduction actions, outreach,
service requests, requests for control, assignments, missions, weather
summaries. Reference data is what it accumulates: habitats, traps, addresses,
regions, contacts, routes, taxonomy, methods, products, units, profiles,
memberships. A habitat is still the habitat it was in 2011, and deleting those
would change what the app *is* rather than how much history it holds.

The dump itself is always whole, since prod is only ever read, and the trim runs
on the target afterwards via `scripts/prune-history.sql`, which is also runnable
on its own:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -v cutoff=2023-08-07 `
  -f scripts/prune-history.sql
```

Four things that file handles and a hand-written `DELETE` would not:

- `inspections -> samples` and `samples -> sample_species` are `ON DELETE
  RESTRICT`, unlike every other child in the schema, so samples must be removed
  before their inspections or the whole transaction aborts.
- `comments`, `additional_personnel`, `tag_items`, `assignment_items`, and
  `route_items` reference their parent as `(entity_type, entity_id)` with no
  foreign key, so nothing cascades to them. Left behind, a stale comment
  reattaches itself to whatever later reuses that id. The file carries the full
  map of those pairs and **aborts** on an `entity_type` missing from it, because
  the alternative is orphans nobody sees.
- Referential integrity needs indexes the schema does not have, so the file
  builds them for the duration and drops them afterwards.
- `addresses`, `regions` and `contacts` are counted inside the transaction
  before the deletes and again before the commit, and any shortfall **aborts**
  the prune with nothing committed. Those three survive today because the
  foreign keys into them are `ON DELETE RESTRICT` and because nothing references
  `regions` at all, which is a schema shape a migration could change without
  saying so. The check is what makes keeping them the prune's own rule.

That last one is worth understanding before touching this, because it is not
what it looks like. Nearly every foreign-key column here *is* indexed, but
indexed `WHERE deleted_at IS NULL`, for the app's soft-delete queries.
Referential integrity's own lookup carries no such predicate, so **the planner
cannot use a partial index for it at all**, and the column behaves as though it
were never indexed. Sixteen columns are in that state and every one of them
looks covered.

The cost is not subtle. On `application_batches (application_id)`, 217k rows and
`ON DELETE CASCADE` from `applications`, it was 11ms per deleted application:
3358ms of a 3362ms delete, and an extrapolated 34 minutes for `applications`
alone. A plain non-partial index took the same work to 3.4ms, and the whole
prune to **under 30 seconds**.

The file therefore *introspects* the missing indexes rather than listing them:
it walks the `ON DELETE CASCADE` closure of the dated roots, then indexes every
foreign-key column into that closure with no index referential integrity can
use. Two hand-written lists were wrong before this became generated. The first
missed partial indexes and the second missed cascade children, so if you find
yourself adding a table name here, add it to the roots array and let the query
find the rest. The transient indexes are named `tmp_prune_*` and dropped by
prefix, so a run that dies partway is cleaned up by the next one.

Whether production wants these indexes permanently is a separate question about
hard-delete write patterns; see issue #126. The app soft-deletes, so it may
never pay this cost; a clone script does not get to decide that.

Notes on the staging refresh:
- Both URLs must be the **public** `*.proxy.rlwy.net:PORT` form, never
  `*.railway.internal`.
- The gate runs first and reads both databases; a refusal touches nothing. The
  dump runs before the wipe, so a bad source URL also aborts with staging
  intact.
- `tiger`/`tiger_data`/`topology` "already exists" and `publication ... already
  exists` restore errors are benign: those schemas and the publication survive
  the schema reset, and the app uses `public` geometry. The row-count check
  after the restore is what proves the data arrived, not the exit code, which
  PostGIS makes non-zero on every healthy run (#347).
- Redeploy Electric afterwards for a clean re-snapshot.

### The WorkOS relink is local dev's, not staging's

The dump carries **production** WorkOS ids. Staging authenticates against WorkOS
production (#377), so those are the ids it wants and `refresh-staging.ps1`
rewrites nothing. Local dev authenticates against WorkOS **staging**, so
`clone-prod-db.ps1` still relinks, and it is the only script that does.

Why it is part of that clone rather than a follow-up:
`resolveActiveLocalAuthIdentity` looks organizations up by
`workos_organization_id`, so an unrelinked row is invisible to a staging
session, and worse than invisible. Signing in against an org id that resolves to
nothing provisions a *fresh* organization, leaving the database with two rows
for the same agency.

So the script rewrites the ids itself, from `$WorkosOrgRelinks` /
`$WorkosUserRelinks` near the top of the file, and then **verifies** that no
organization still carries a mapped prod id. That check is the point: a relink
whose only verification is someone noticing a broken workspace is one clone away
from being lost, which is exactly what #82 was.

**When a new agency exists in both environments, add it to `$WorkosOrgRelinks`.**
The script prints any organization whose id is outside the map after relinking,
that list should be empty, and anything in it will duplicate on next sign-in.
Pass `-SkipRelink` only when you intend to work through `DEV_IMPERSONATE_*`.

## GitHub environments

Create GitHub environments named `staging` and `production`.

Each environment needs these secrets:

- `DATABASE_URL`: public Railway Postgres URL for that environment, with
  `sslmode=disable` when using the current PostGIS image. This is used by
  dbmate migrations and seed workflow runs.
- `RAILWAY_TOKEN`: Railway token allowed to deploy the project.

Each environment needs these variables:

- `RAILWAY_PROJECT_ID`: Railway project id.
- `RAILWAY_ENVIRONMENT`: Railway environment name or id, for example `staging`
  or `production`.
- `RAILWAY_SERVER_SERVICE`: Railway server service name or id.
- `RAILWAY_ADMIN_SERVICE`: Railway admin service name or id.
- `RAILWAY_WEB_SERVICE`: Railway web service name or id.

## Railway service settings

Configure each deployable service from the repository root.

**Server**: Railpack, with install, build, and start commands:

```sh
pnpm install --frozen-lockfile
pnpm --filter @simmer-mosquito/server build
pnpm --filter @simmer-mosquito/server start
```

That filtered build is not the one CI's `verify` job runs. `pnpm build` is
`nx run-many`, which orders projects from package.json dependencies;
`pnpm --filter <app> build` is `tsc -b`, which orders them from tsconfig
`references` alone. A dependency declared in only one of the two is green in CI
and fails here, on the deploy. See "Build toolchain" in CLAUDE.md, and #175,
which broke all three services that way. Two CI checks catch that before a
deploy now. `pnpm check:build-graph` asserts the two graphs agree, and the
`Shipped build` job runs each app's filtered build against a clean tree, one
runner per app, because a `dist` another build already left satisfies an import
whose order was never declared.

**Web** and **admin**: Dockerfile, with no commands at all. Both are static
sites and neither runs Node in production; see "Static site images" below. On
each of those two services:

- set `RAILWAY_DOCKERFILE_PATH` (a service *variable*, not a setting) to
  `apps/web/Dockerfile` or `apps/admin/Dockerfile`. Railway looks for a
  `Dockerfile` at the root of the source directory otherwise, and there isn't
  one there;
- **clear the Build Command and Start Command fields.** A leftover start
  command overrides the image's `CMD`, and `pnpm --filter … start` is a script
  that no longer exists. The deploy would build cleanly and then crash-loop.

### Static site images

`apps/web/Dockerfile` and `apps/admin/Dockerfile` build the workspace on
`node:22.16.0-slim` and copy only `dist/` into a `caddy:2-alpine` runtime, so
production serves the two SPAs with no Node process. Both stages are the same
in the two files; what differs is the `--filter` and which `VITE_*` values are
declared.

Three things worth knowing before editing either:

- **the build context is the workspace root**, not the app directory. Each app
  compiles against the shared packages through TypeScript project references, so
  a context scoped to `apps/web` could not resolve any of them. `.dockerignore`
  at the root is what keeps `node_modules` and `.env` out.
- **`VITE_*` values must be declared as `ARG`.** Railway injects service
  variables into a Docker build only for names the Dockerfile declares. An
  undeclared one does not fail the build. Vite inlines an empty string and the
  app ships pointed at nothing. Adding a `VITE_*` variable to a service means
  adding an `ARG`/`ENV` pair to that app's Dockerfile in the same change.
- **the Caddy config is shared** (`Caddyfile.static` at the workspace root, one
  file for both images). It sets `Cache-Control: immutable` for a year on
  `/assets/*`, which Vite content-hashes, and `no-cache` on everything else so a
  deploy actually reaches a tab holding an old `index.html`. It also does the
  SPA fallback, `zstd`/`gzip` compression, and the security headers. The
  `Permissions-Policy` there deliberately omits `geolocation`, because the web
  app's map has a locate-me control.

This replaced `vite preview`, which Vite documents as a way to check a
production build locally rather than as a production server (issue #85). The
`preview.allowedHosts` plumbing in the Vite configs and the
`VITE_PREVIEW_ALLOWED_HOSTS` variable existed only to satisfy its host check and
are both gone; the `preview` npm scripts remain for their documented local use.

## Runtime variables

Set these on the Railway server service in each environment:

```sh
APP_ORIGIN=https://<web-domain>
ADMIN_APP_ORIGIN=https://<admin-domain>
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_URL=http://electric.railway.internal:3000/v1/shape
HOST=0.0.0.0
NODE_ENV=production
SIMMER_OPERATOR_ORG_ID=<the WorkOS org that is SIMMER, in this environment>
WORKOS_API_KEY=<workos-api-key>
WORKOS_CLIENT_ID=<workos-client-id>
WORKOS_COOKIE_PASSWORD=<32-plus-character-secret>
WORKOS_REDIRECT_URI=https://<server-domain>/auth/callback
```

On **staging** also set `ELECTRIC_SECRET=<same secret as the staging Electric
service>` so the server authenticates to the now-secured Electric. Production
omits it (its Electric is insecure/private). The server keeps using the internal
`ELECTRIC_URL` in both, because the public Electric domain is only for local dev.

On **staging** also set `WORKOS_IDENTITY_WRITES_DISABLED=true`. Staging
authenticates against WorkOS production, so without it an invitation sent from
unreleased code mails a real address, a removal revokes somebody's real access,
and a password reset mails a working link for a production account. With it set,
every WorkOS identity write answers 403 `workos_identity_writes_disabled` and
only SIMMER's own rows are written. Signing in, switching agency and signing out
are unaffected; inviting, re-inviting, changing a role, removing access,
resetting a password, signing up and creating an agency from the operator
console all refuse. Nobody new can be onboarded on staging, which is the
intended shape and not a gap.

Read as the exact string `true`, and **absent means settle**, so the variable
going missing in production cannot silently turn identity off. Production must
not set it. `apps/server/src/workos-identity-interlock.ts` is the allowlist and
ADR-adjacent reasoning; the decision is issue #376.

Set these on the Railway web service (all `VITE_*` are baked in at build time, so
a change requires a rebuild/redeploy of the service):

```sh
RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
VITE_SERVER_URL=https://<server-domain>
VITE_MAPBOX_ACCESS_TOKEN=pk.<mapbox-public-token>
VITE_SIMMER_ENVIRONMENT=staging   # staging only; omit in production
```

`VITE_SIMMER_ENVIRONMENT` draws the environment banner, the strip above both
rails naming the deployment and saying the data is replaced on the next
refresh. Only the exact string `staging` draws it. Production is meant to have
no value at all: a Docker `ARG` a build never passes arrives as an empty
string rather than absent, so `''` and unset both have to read as production,
and comparing against a literal is what makes them. Setting it to `production`
is allowed and does nothing.

It does one more thing, which is not visible on screen: a staging build keeps
its Electric shape streams running while the tab reports hidden. Electric
pauses a stream on a hidden tab, and a stream born hidden issues no requests at
all, so an agent driving staging in a background tab would sit on a loading
skeleton forever (#228, #381). Local development already had that override;
`import.meta.env.DEV` is false in any `vite build`, so staging opts in through
this variable instead. Production keeps pausing, which is what a backgrounded
customer tab should do.

`VITE_MAPBOX_ACCESS_TOKEN` is required for map views to render. Each `VITE_*`
name here has a matching `ARG` in `apps/web/Dockerfile`, and only declared names
reach the build. See "Static site images".

`VITE_SHAPE_SERVER_URL` is optional. Leave it unset unless a deployment has a
separate browser-facing HTTPS/HTTP2 proxy for shape streams; when unset, the web
app uses `VITE_SERVER_URL` for both API requests and shapes.

For local Docker development, Electric is already exposed on `localhost:3001`,
but browser shape requests go through the server's `/sync/shapes/*` proxy routes.
If using Caddy for browser HTTP/2 shape streams, run Caddy on another port such
as `https://localhost:3002` and proxy it to the API server at
`http://localhost:3000`.

### Admin service (Serverless)

The operator console is a static SPA served by Caddy out of the image
`apps/admin/Dockerfile` builds. Set:

```sh
RAILWAY_DOCKERFILE_PATH=apps/admin/Dockerfile
VITE_SERVER_URL=https://<server-domain>
VITE_SIMMER_OPERATOR_ORG_ID=<the WorkOS org that is SIMMER, in this environment>
VITE_SIMMER_ENVIRONMENT=staging   # staging only; omit in production
```

The console wears the same banner as the agency workspace, and keeps syncing in
a hidden tab on the same terms, off the same variable. See "Web service" above.

Current organization ids: `org_01KRQEQBJJHF729PY0ED6P7875` (production),
`org_01KZC6NB6PPMV9GKYVHS4VJAQF` (staging).

`VITE_SIMMER_OPERATOR_ORG_ID` is how the console answers WorkOS's organization
challenge without asking. WorkOS refuses to mint a session for an account in more
than one organization until one is chosen, and operators are routinely in
several: `createAdminAgency`'s `linkRequesterAsOwner` makes the operator the new
agency's first owner. The console picks this one and refuses any account that is
not a member of it: **being in the SIMMER organization is what operator access
means.** There is no picker; a non-member is turned away rather than let in under
some agency's identity.

Note this is a build-time `VITE_` value like the others, so changing it needs a
redeploy, and that it is deliberately *not* server-side. If `/auth/sign-in`
enforced it, it would also strip the picker from `apps/web`, where an operator
who genuinely holds an agency membership still needs to choose.

#### Set both, and set them to the same organization

`VITE_SIMMER_OPERATOR_ORG_ID` here and `SIMMER_OPERATOR_ORG_ID` on the server are
a pair, on two different services, and each is useless without the other. They
fail in different places, so a deployment that has only one looks like two
unrelated problems:

- **Miss the console's.** Sign-in stops at the organization challenge and says
  which variable to set. Nothing to diagnose.
- **Miss the server's.** Sign-in succeeds, and then every `/admin/*` route
  answers `403 operator_not_configured`. The console renders "Server Not
  Configured" and names the variable, and the server logs the same thing once at
  boot. Both are new; before them the refusal was indistinguishable from "you are
  not an operator", and the console told operators to sign back in as SIMMER on a
  deployment where no session could be one.

The unset server value still refuses everyone, which is deliberate: an
unconfigured deployment has no operators rather than all of them. Only the
reporting changed.

It does **not** need a Mapbox token: the console has no maps by design. Geometry
comes from KML/KMZ/GeoJSON files and typed coordinates (see
`apps/admin/src/components/geometry-input.tsx`), so `mapbox-gl` stays out of a
bundle that would otherwise pay 1.7 MB for it.

Enable **Serverless** on this service (Railway Settings → Serverless; the API
field is `sleepApplication`). It is a good fit and a poor one for the others:

- the console is opened by a handful of operators a few times a week, so it is
  idle almost always;
- it holds no database connections and emits no telemetry, so it goes fully
  quiet and Railway's 10-minute outbound-traffic check actually trips. The
  `server` service can never sleep, because Electric and Postgres connections
  keep it talking, and `web` is customer-facing, where a cold start is not
  acceptable.

Caveats worth knowing before someone reports them as bugs:

- the first request after ~10 idle minutes is slow, and Railway may answer it
  with a one-off `502` that resolves on reload. What wakes now is Caddy reading
  a config file, not Node booting a Vite server, so the container's own share of
  that is small; the wait is Railway restoring the instance;
- sign-in is unaffected: the session cookie is set by the `server` service,
  which is always warm.

Set `ADMIN_APP_ORIGIN=https://<admin-domain>` on that environment's **server**
service. The console signs in through the shared `POST /auth/*` endpoints, and
`allowedCorsOrigins()` reads that variable, and without it sign-in fails CORS.

**Write the scheme anyway, but a missing one is no longer fatal.** `parseOrigin`
in `apps/server/src/env.ts` normalizes a schemeless value to `https://<host>`,
because `readServerEnv` runs at module load and a throw there means the process
never reaches `listen`. That exact slip took production down once and was caught
on staging once: the whole API, over a variable whose only job is CORS for the
operator console. Input that cannot be an http origin at all still throws. The
same applies to `APP_ORIGIN`.

### Electric service

The two environments are configured differently: staging's Electric is reachable
over a public domain and secured with `ELECTRIC_SECRET`, production's is private.
The reachability was for local dev, which no longer points at staging.

**Production**: private, insecure, no public domain:

```sh
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_INSECURE=true
```

The prod server reaches it over Railway private DNS
(`ELECTRIC_URL=http://electric.railway.internal:3000/v1/shape`). Do not give prod
Electric a public domain.

**Staging**: public domain and secret, so a local dev server can reach it safely:

```sh
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_SECRET=<strong-random-secret>
PORT=3000
```

- Generate a public domain on the service (Railway "Generate Domain", target port
  3000). `ELECTRIC_URL` on the local dev server is then
  `https://<that-domain>/v1/shape`.
- Do **not** set `ELECTRIC_INSECURE` here; the secret is what protects it.
- `PORT=3000` is required for the public domain to route. Railway's HTTP edge
  targets the service's `PORT`; Electric listens on 3000 (it reads `ELECTRIC_PORT`,
  not `PORT`, so `PORT` only steers Railway's edge, it does not change Electric).
  Without it a generated domain returns `502` with `x-railway-fallback: true`.
  Private `electric.railway.internal:3000` routing does not need `PORT`.

Set the same `ELECTRIC_SECRET` on that environment's **server** service too (both
the deployed staging server, which still uses the internal `ELECTRIC_URL`, and
your local `.env`). The server folds the secret into `ELECTRIC_URL` as a `secret`
query param on every upstream shape request (`readElectricUrl` in
`apps/server/src/env.ts`), and treats `secret` as a server-owned shape param so a
client can't inject or override it. With no `ELECTRIC_SECRET` set the forwarding
is inert (production, local Docker), so the change is backward-compatible.

Verify enforcement: `GET https://<electric-domain>/v1/shape?table=units&offset=-1`
returns `401` without `&secret=…` and `200` with the correct secret.

The PostGIS service must have logical replication enabled for Electric. In
DBeaver or another SQL client, run:

```sql
alter system set wal_level = 'logical';
alter system set max_replication_slots = 10;
alter system set max_wal_senders = 10;
```

Restart the PostGIS service, then verify:

```sql
show wal_level;
show max_replication_slots;
show max_wal_senders;
```

## WorkOS

For each deployed environment, add the server callback URL to WorkOS:

```text
https://<server-domain>/auth/callback
```

Current callbacks:

```text
https://api.simmer-data.com/auth/callback
https://api-staging.simmer-data.com/auth/callback
```

The server `APP_ORIGIN` must match the web origin and `ADMIN_APP_ORIGIN` must
match the admin origin so authenticated browser requests and redirects line up.

## Pipeline

`.github/workflows/railway-deploy.yml` maps branches to environments:

- push to `staging` deploys the Railway `staging` environment;
- push to `main` deploys the Railway `production` environment.

Each run is three sequential jobs: **verify → migrate → deploy** (server + web +
admin). `admin` joined the deploy matrix when the console was reworked onto the
shared `packages/ui-web` shell and form kit: it now ships code the web app also
ships, so deploying one without the other would put two versions of the same
shell in production.
`migrate` and `deploy` `need:` `verify`, so:

- **`verify` runs `pnpm typecheck` and `pnpm test`.** If either fails, nothing
  deploys.** Keep `main` green; a stale/broken test blocks *all* deploys, not just
  the offending branch. (Run `pnpm typecheck && pnpm test` locally before pushing.)
- **Pushing `main` is a production release.** It deploys whatever is on `main`,
  not only your latest commit, but any commits accumulated on `main` since the last
  green deploy ship together. Fast-forward `staging`→`main` and let staging deploy
  first when you want a staging soak before prod.
- Env-var changes on a Railway service are separate from code deploys, so set them
  via the Railway dashboard/CLI (`railway variables --set …`) or MCP; they don't
  come from the repo.

**The rot gates do not gate deploys, on purpose.** `fallow dead-code`, `fallow
dupes`, and `fallow:health` run in `ci.yml`, and `verify` here runs typecheck,
test, and build, and it never consults them. Duplication and complexity are read as
"did this branch make it worse" against where the workspace already is, and a
threshold judgement about the shape of the code is not a reason to refuse a
release to an agency that is waiting on a fix. The cost is that a red CI on
`main` does not stop anything shipping, which is how #136 sat red across several
green production deploys: read a red `main` as work owed, not as a broken
release, and check which job failed before treating it as either.

The separate DB migration workflow (`db-migrate.yml`) remains available for
targeted migration retries. `workflow_dispatch` on the deploy workflow allows a
manual deploy to a chosen environment from its matching branch.

`schema-drift.yml` asks the question `db-migrate.yml` cannot: is staging's
schema still the one `packages/db/migrations` produces? It runs at 16:00 UTC
daily and on `workflow_dispatch`, and it covers what the migration workflow does
not — a migration applied by hand, a `dbmate` run that half-failed, a fix made
straight on staging. It reads staging and writes nothing there: the expected
schema is built by `dbmate` in a service container beside the job, and the
comparison script opens both sessions read only before its first query. That
constraint is #236's: the integration harness sends the whole migration set as
one transaction, and running it against staging is the #166 outage.

Two comparisons, both in `scripts/check-schema-drift.mjs`, which takes two
connection URLs and runs anywhere:

```sh
node scripts/check-schema-drift.mjs \
  --observed "$DATABASE_URL" \
  --expected postgres://postgres:postgres@localhost:5432/simmer_reference
```

`schema_migrations` against the migration filenames catches a half-applied set.
The catalog against the container's catalog catches a column, index, constraint
or trigger on one side only. The second reads `information_schema` and
`pg_catalog`, never the migration text, because parsing `create table` blocks
misses every `alter table ... add column` (#123).

A red run files a GitHub issue labelled `schema drift` naming the divergent
objects, comments on that issue rather than filing a second one on the next red
run, and closes it when a later run is green. So the tracker holds at most one
open drift issue and its state is the current answer.

GitHub staging environment values:

```sh
RAILWAY_ENVIRONMENT=staging
RAILWAY_SERVER_SERVICE=server
RAILWAY_ADMIN_SERVICE=admin
RAILWAY_WEB_SERVICE=web
```

GitHub production environment values:

```sh
RAILWAY_ENVIRONMENT=production
RAILWAY_SERVER_SERVICE=server
RAILWAY_ADMIN_SERVICE=admin-prod
RAILWAY_WEB_SERVICE=web
```

**The admin service is named differently per environment**: `admin` in staging,
`admin-prod` in production, which is why the deploy workflow reads the name from
a per-environment variable rather than hardcoding it. Everything else shares a
name across both. Verify with `railway service list` (or the MCP
`list_services`) before assuming; a wrong name fails the deploy step with an
unhelpful error.

## Demo bootstrap

For a fresh Railway environment:

1. Enable WAL/logical replication on the PostGIS service and restart it.
2. Push to `staging` or run the migration workflow manually from the `staging`
   branch with target `staging`.
3. Wait for the Railway deploy workflow to complete.
4. Open the staging web URL and sign in through WorkOS.
5. Insert and commit a row into `public.units`.
6. The signed-in demo page should render the unit without a manual browser
   refresh.
7. Merge or fast-forward `staging` to `main` and repeat the same sequence for
   production.

The seed workflow is idempotent for the same organization id and preserves an
existing WorkOS organization link when seeding a real signed-in organization.
Manual data insertion is also valid for smoke testing as long as the DB client
commits the transaction. DBeaver can show generated UUIDs for uncommitted rows;
refreshing the connection rolls those rows back unless Auto-commit is enabled
or the transaction is explicitly committed.

## Verified baseline

As of 2026-05-16, production and staging have both been smoke tested:

- custom web and API domains resolve;
- WorkOS login redirects through the API domain and returns to the web domain;
- GitHub workflows run against the branch-mapped environment;
- fresh staging database migrations apply from the `staging` branch;
- Electric connects to private PostGIS and serves server-proxied shapes;
- committed `public.units` rows render live on the signed-in web page without a
  manual refresh.

As of 2026-07-09, the Railway-backed local-dev workflow was established:

- staging Electric exposed on a public domain, secured with `ELECTRIC_SECRET`
  (`ELECTRIC_INSECURE` removed, `PORT=3000` added); enforcement verified
  (401 without secret, 200 with);
- the local server proxies shapes to staging Electric with the secret and reads
  from staging Postgres over the public proxy, verified returning real data;
- staging redeployed with the secret-forwarding server and `ELECTRIC_SECRET` set;
  production redeployed (Electric unchanged: private, insecure, forwarding inert);
- staging DB seeded from a production clone via `clone-prod-to-staging.ps1`
  (PostGIS + geometry intact, migrations current).
