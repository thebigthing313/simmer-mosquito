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

Use Railway's Postgres template for the database. Use an image-based service for
ElectricSQL with the `electricsql/electric:latest` image.

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

- `DATABASE_URL`: public Railway Postgres URL for that environment. This is
  used by dbmate migrations and seed workflow runs.
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
DATABASE_URL=${{Postgres.DATABASE_URL}}
ELECTRIC_URL=https://<electric-domain>/v1/shape
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
DATABASE_URL=${{Postgres.DATABASE_URL}}
ELECTRIC_INSECURE=true
```

Expose the Electric service with a Railway domain and use its `/v1/shape` URL
as the server service `ELECTRIC_URL`.

## WorkOS

For each deployed environment, add the server callback URL to WorkOS:

```text
https://<server-domain>/auth/callback
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

## Demo Bootstrap

For a fresh Railway environment:

1. Push to `staging` and wait for the Railway deploy workflow to complete.
2. Open the staging web URL and sign in through WorkOS.
3. If the signed-in page shows an organization id, run the
   `Seed Sync Baseline` workflow against `staging` with that SIMMER
   organization id.
4. Refresh the web page. The signed-in demo panels should show synced profiles,
   lookup catalogs, taxonomy, tags, routes, and units.
5. Merge or fast-forward `staging` to `main` and repeat the same sequence for
   production.

The seed workflow is idempotent for the same organization id and preserves an
existing WorkOS organization link when seeding a real signed-in organization.
