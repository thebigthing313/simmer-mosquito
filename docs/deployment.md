# Deployment Runbook

SIMMER has three operating environments:

- **local development** — `apps/server` and the frontends run on your machine.
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
| Production | `https://app.simmer-data.com` | TBD | `https://api.simmer-data.com` |
| Staging | `https://staging.simmer-data.com` | TBD | `https://api-staging.simmer-data.com` |

In every environment, browsers never call Electric directly — they call the Hono
server's authenticated `/sync/shapes/*` routes and the server proxies to Electric.
Electric's networking differs per environment:

- **production** — Electric is **private** (`electric.railway.internal:3000`) and
  runs `ELECTRIC_INSECURE=true`. Only the co-located prod server reaches it.
- **staging** — Electric has a **public domain** and is secured with
  `ELECTRIC_SECRET` (not `ELECTRIC_INSECURE`). This lets a **locally-run** server
  reach it for Railway-backed local development, without leaving it
  world-readable. See "Electric service" for the exact settings.

## Local development

In both modes, `apps/server` + the frontends run locally (with HMR) and the
browser talks only to the local server; only *where Postgres + Electric live*
differs. `apps/server` reads env from `apps/server/.env`; Vite reads from the
repo-root `.env` (its `envDir` is the workspace root). Keep the shared keys in
sync across both files.

Run the apps (either mode):

```sh
pnpm dev:server
pnpm dev:web
pnpm dev:admin   # optional (operator console)
pnpm dev:caddy   # HTTPS/HTTP2 front for the web app + shape streams
```

Caddy (`Caddyfile.local`) serves the web app at `https://localhost:5175` and
fronts the API server at `https://localhost:3002` (HTTP/2, needed because Electric
sync opens many concurrent shape requests). `APP_ORIGIN`/`VITE_SERVER_URL`/
`VITE_SHAPE_SERVER_URL` point at those Caddy origins in both modes.

### Mode A — Railway-backed (recommended)

Run the apps locally but point them at the **staging** environment's Postgres +
Electric on Railway. This is the default going forward — it frees local resources
and avoids flaky local Electric. Because a laptop-hosted server cannot reach
`*.railway.internal`, use staging Postgres's **public TCP proxy** URL and
Electric's **public domain** (secured with `ELECTRIC_SECRET`; see "Electric
service").

In **both** `.env` and `apps/server/.env`, set only these three:

```sh
DATABASE_URL=postgres://postgres:<pw>@<host>.proxy.rlwy.net:<port>/simmer?sslmode=disable
ELECTRIC_URL=https://<electric-staging-domain>/v1/shape
ELECTRIC_SECRET=<the secret set on the staging Electric + server services>
```

Get `DATABASE_URL` from staging postgis's `DATABASE_PUBLIC_URL` (append
`?sslmode=disable`); the staging DB name is `simmer`. Get `<electric-staging-domain>`
from the Electric service's public domain. Leave everything else local
(`APP_ORIGIN`, `VITE_*`, `WORKOS_REDIRECT_URI`, `DEV_IMPERSONATE_*`). No local
Docker is needed; stop it if running (`docker compose down`).

Seed staging with realistic data by cloning production into it — see "Cloning
production data into staging". The `DEV_IMPERSONATE_*` ids in `.env` must
correspond to a membership present in that data (they're prod-derived, so a prod
clone satisfies them) for the dev auth bypass to resolve.

### Mode B — fully local Docker

Self-contained; requires no Railway resources. Start local Postgres + Electric:

```sh
docker compose up -d postgres electric
pnpm db:migrate
pnpm --filter @simmer-mosquito/db seed:sync-baseline
```

Use the `.env.example` values (Postgres on `localhost:55432`, Electric on
`localhost:3001`, `ELECTRIC_SECRET` unset — local Electric runs
`ELECTRIC_INSECURE=true`).

## Cloning production data into staging

`scripts/clone-prod-to-staging.ps1` reloads the staging database from a prod dump
so Railway-backed local dev shows realistic data. It uses locally-installed
PostgreSQL client tools (auto-detects `C:\Program Files\PostgreSQL\*\bin`; a client
>= the server major version — 18 is fine — no Docker required) and resets the
target with `DROP SCHEMA public CASCADE` rather than `DROP DATABASE`, so the
Electric replication slot is left intact and **Electric does not need to be
stopped**. Electric re-snapshots each shape on demand after the reload.

```powershell
$env:PROD_DATABASE_URL    = '<prod public proxy URL>'      # *.proxy.rlwy.net, read-only role preferred
$env:STAGING_DATABASE_URL = '<staging public proxy URL>?sslmode=disable'
./scripts/clone-prod-to-staging.ps1
```

Notes:
- Both URLs must be the **public** `*.proxy.rlwy.net:PORT` form, never
  `*.railway.internal`.
- The dump runs first; a bad source URL aborts before anything is wiped.
- `tiger`/`tiger_data`/`topology` "already exists" and `publication ... already
  exists` restore errors are benign (schemas/publication survive the schema
  reset; the app uses `public` geometry). Verify PostGIS + row counts after
  (the script prints org/membership counts).
- A one-off Electric redeploy afterwards is optional but gives it a fully clean
  re-snapshot.

`scripts/clone-prod-db.ps1` is the sibling that clones prod into **local Docker**
Postgres (Mode B) instead.

## GitHub Environments

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

## Railway Service Settings

Configure each deployable service from the repository root.

Server:

```sh
pnpm install --frozen-lockfile
pnpm --filter @simmer-mosquito/server build
pnpm --filter @simmer-mosquito/server start
```

Web:

```sh
pnpm install --frozen-lockfile
pnpm --filter @simmer-mosquito/web build
pnpm --filter @simmer-mosquito/web start
```

Admin:

```sh
pnpm install --frozen-lockfile
pnpm --filter @simmer-mosquito/admin build
pnpm --filter @simmer-mosquito/admin start
```

## Runtime Variables

Set these on the Railway server service in each environment:

```sh
APP_ORIGIN=https://<web-domain>
ADMIN_APP_ORIGIN=https://<admin-domain>
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_URL=http://electric.railway.internal:3000/v1/shape
HOST=0.0.0.0
NODE_ENV=production
SIMMER_OPERATOR_EMAILS=<operator-email-list>
WORKOS_API_KEY=<workos-api-key>
WORKOS_CLIENT_ID=<workos-client-id>
WORKOS_COOKIE_PASSWORD=<32-plus-character-secret>
WORKOS_REDIRECT_URI=https://<server-domain>/auth/callback
```

On **staging** also set `ELECTRIC_SECRET=<same secret as the staging Electric
service>` so the server authenticates to the now-secured Electric. Production
omits it (its Electric is insecure/private). The server keeps using the internal
`ELECTRIC_URL` in both — the public Electric domain is only for local dev.

Set these on the Railway web service (all `VITE_*` are baked in at build time, so
a change requires a rebuild/redeploy of the service):

```sh
VITE_SERVER_URL=https://<server-domain>
VITE_MAPBOX_ACCESS_TOKEN=pk.<mapbox-public-token>
VITE_PREVIEW_ALLOWED_HOSTS=<web-domain>
```

`VITE_MAPBOX_ACCESS_TOKEN` is required for map views to render. `RAILWAY_PUBLIC_DOMAIN`
is injected by Railway and also feeds `preview.allowedHosts`.

`VITE_SHAPE_SERVER_URL` is optional. Leave it unset unless a deployment has a
separate browser-facing HTTPS/HTTP2 proxy for shape streams; when unset, the web
app uses `VITE_SERVER_URL` for both API requests and shapes.

For local Docker development, Electric is already exposed on `localhost:3001`,
but browser shape requests go through the server's `/sync/shapes/*` proxy routes.
If using Caddy for browser HTTP/2 shape streams, run Caddy on another port such
as `https://localhost:3002` and proxy it to the API server at
`http://localhost:3000`.

Set this on the Railway admin service:

```sh
VITE_SERVER_URL=https://<server-domain>
VITE_PREVIEW_ALLOWED_HOSTS=<admin-domain>
```

### Electric service

The two environments are configured differently, because staging's Electric must
be reachable from a laptop for Railway-backed local dev while production's stays
private.

**Production** — private, insecure, no public domain:

```sh
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_INSECURE=true
```

The prod server reaches it over Railway private DNS
(`ELECTRIC_URL=http://electric.railway.internal:3000/v1/shape`). Do not give prod
Electric a public domain.

**Staging** — public domain + secret so a local dev server can reach it safely:

```sh
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_SECRET=<strong-random-secret>
PORT=3000
```

- Generate a public domain on the service (Railway "Generate Domain", target port
  3000). `ELECTRIC_URL` on the local dev server is then
  `https://<that-domain>/v1/shape`.
- Do **not** set `ELECTRIC_INSECURE` here — the secret is what protects it.
- `PORT=3000` is required for the public domain to route. Railway's HTTP edge
  targets the service's `PORT`; Electric listens on 3000 (it reads `ELECTRIC_PORT`,
  not `PORT`, so `PORT` only steers Railway's edge, it does not change Electric).
  Without it a generated domain returns `502` with `x-railway-fallback: true`.
  Private `electric.railway.internal:3000` routing does not need `PORT`.

Set the same `ELECTRIC_SECRET` on that environment's **server** service too (both
the deployed staging server — which still uses the internal `ELECTRIC_URL` — and
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

Each run is three sequential jobs: **verify → migrate → deploy** (server + web).
`migrate` and `deploy` `need:` `verify`, so:

- **`verify` runs `pnpm typecheck` and `pnpm test` — if either fails, nothing
  deploys.** Keep `main` green; a stale/broken test blocks *all* deploys, not just
  the offending branch. (Run `pnpm typecheck && pnpm test` locally before pushing.)
- **Pushing `main` is a production release.** It deploys whatever is on `main`,
  not just your latest commit — any commits accumulated on `main` since the last
  green deploy ship together. Fast-forward `staging`→`main` and let staging deploy
  first when you want a staging soak before prod.
- Env-var changes on a Railway service are separate from code deploys — set them
  via the Railway dashboard/CLI (`railway variables --set …`) or MCP; they don't
  come from the repo.

The separate DB migration workflow (`db-migrate.yml`) remains available for
targeted migration retries. `workflow_dispatch` on the deploy workflow allows a
manual deploy to a chosen environment from its matching branch.

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
RAILWAY_ADMIN_SERVICE=admin
RAILWAY_WEB_SERVICE=web
```

## Demo Bootstrap

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

## Verified Baseline

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
  from staging Postgres over the public proxy — verified returning real data;
- staging redeployed with the secret-forwarding server and `ELECTRIC_SECRET` set;
  production redeployed (Electric unchanged — private/insecure, forwarding inert);
- staging DB seeded from a production clone via `clone-prod-to-staging.ps1`
  (PostGIS + geometry intact, migrations current).
