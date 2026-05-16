# Deployment Runbook

SIMMER has three operating environments:

- local development, using only local Docker Compose resources;
- staging on Railway from the `staging` branch;
- production on Railway from the `main` branch.

The deployed Railway shape is one project with separate `staging` and
`production` environments. Each environment should have these services:

- Postgres with PostGIS;
- ElectricSQL;
- `server`;
- `web`;
- `worker`.

Use a PostGIS-capable PostgreSQL service for the database. Use an image-based
service for ElectricSQL with the `electricsql/electric:latest` image.

The current deployed domains are:

| Environment | Web | Server |
| --- | --- | --- |
| Production | `https://app.simmer-data.com` | `https://api.simmer-data.com` |
| Staging | `https://staging.simmer-data.com` | `https://api-staging.simmer-data.com` |

Electric stays private on Railway internal networking. Browsers call the Hono
server, and the server proxies authorized shape requests to Electric.

## Local Development

Start local resources:

```sh
docker compose up -d postgres electric
```

Run migrations and seed the sync tracer:

```sh
pnpm db:migrate
pnpm --filter @simmer-mosquito/db seed:sync-baseline
```

Run the apps:

```sh
pnpm dev:server
pnpm dev:web
pnpm dev:worker
```

Local `.env` should use the values in `.env.example`. Local development should
not require Railway resources.

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
- `RAILWAY_WEB_SERVICE`: Railway web service name or id.
- `RAILWAY_WORKER_SERVICE`: Railway worker service name or id.

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

Worker:

```sh
pnpm install --frozen-lockfile
pnpm --filter @simmer-mosquito/worker build
pnpm --filter @simmer-mosquito/worker start
```

## Runtime Variables

Set these on the Railway server service in each environment:

```sh
APP_ORIGIN=https://<web-domain>
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

Set this on the Railway web service:

```sh
VITE_SERVER_URL=https://<server-domain>
VITE_PREVIEW_ALLOWED_HOSTS=<web-domain>
```

Set this on the Railway worker service:

```sh
NODE_ENV=production
```

Set these on the Railway Electric service:

```sh
DATABASE_URL=${{postgis.DATABASE_URL}}
ELECTRIC_INSECURE=true
```

Do not expose Electric publicly for the current web deployment. The server uses
Railway private DNS:

```sh
http://electric.railway.internal:3000/v1/shape
```

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

The server `APP_ORIGIN` must match the web origin so authenticated browser
requests and redirects line up.

## Pipeline

The deployment workflow maps branches to environments:

- push to `staging` deploys the Railway `staging` environment;
- push to `main` deploys the Railway `production` environment.

The Railway deploy workflow verifies the workspace, applies dbmate migrations,
then deploys server, web, and worker services. The separate DB migration
workflow remains available for targeted migration retries.

GitHub staging environment values:

```sh
RAILWAY_ENVIRONMENT=staging
RAILWAY_SERVER_SERVICE=server
RAILWAY_WEB_SERVICE=web
RAILWAY_WORKER_SERVICE=worker
```

GitHub production environment values:

```sh
RAILWAY_ENVIRONMENT=production
RAILWAY_SERVER_SERVICE=server
RAILWAY_WEB_SERVICE=web
RAILWAY_WORKER_SERVICE=worker
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
