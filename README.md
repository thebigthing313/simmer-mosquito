# Simmer Mosquito

Nx-managed pnpm monorepo for mosquito control and surveillance software.

## Workspace Layout

- `apps/admin`: SIMMER operator SPA for platform-controlled organization, user,
  taxonomy, and unit management.
- `apps/preview`: Internal component preview and design-system workshop for
  tokens, icons, component stress tests, sandboxing, and workflow templates.
- `apps/server`: Hono HTTP control plane for auth, sync proxies, and command endpoints.
- `apps/web`: Vite React SPA shell for browser auth and future agency workflows.
- `apps/worker`: Background worker for scheduled surveillance/control jobs.
- `packages/config`: Shared environment parsing.
- `packages/db`: SQL migrations and Kysely/Postgres helpers.
- `packages/auth`: WorkOS AuthKit/session helpers.
- `packages/design-tokens`: Framework-free SIMMER visual tokens exposed as CSS
  variables and TypeScript constants.
- `packages/domain`: Shared domain types and calculations.
- `packages/ui-web`: Shared web UI components, styles, and semantic icon
  registry.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm dev:admin
pnpm dev:preview
pnpm dev:server
pnpm dev:web
pnpm dev:worker
pnpm graph
```

## Testing

Fast package tests run with each package's `pnpm test` script. Postgres-backed
DB integration tests are opt-in so normal local and CI runs do not accidentally
touch a developer database.

To run DB integration tests locally, start the PostGIS service and provide an
explicit test database URL:

```sh
docker-compose up -d postgres
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/simmer_mosquito pnpm --filter @simmer-mosquito/db test
```

On Windows PowerShell:

```powershell
docker-compose up -d postgres
$env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/simmer_mosquito'
pnpm --filter @simmer-mosquito/db test
```

`packages/db/src/test-support/db-integration.ts` creates an isolated schema,
applies every migration's `migrate:up` SQL into that schema, runs the test, and
drops the schema afterward. Tests using that helper are skipped unless
`SIMMER_TEST_DATABASE_URL` or `TEST_DATABASE_URL` is set.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the current system shape
and [docs/adr](docs/adr) for accepted architecture decisions. See
[docs/plan.md](docs/plan.md) for implementation progress and the recommended
next slice.

## Railway Notes

See [docs/deployment.md](docs/deployment.md) for the full local/staging/
production setup and GitHub Actions pipeline.

Create one Railway service per deployable app. For the server service, use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @simmer-mosquito/server build`
- Start command: `pnpm --filter @simmer-mosquito/server start`

The server binds to `0.0.0.0` and reads Railway's `PORT` environment variable.

For the admin service, use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @simmer-mosquito/admin build`
- Start command: `pnpm --filter @simmer-mosquito/admin start`

Server environment variables:

```sh
APP_ORIGIN=https://your-web-app.example
ADMIN_APP_ORIGIN=https://your-admin-app.example
DATABASE_URL=${{Postgres.DATABASE_URL}}
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=at-least-32-characters
WORKOS_REDIRECT_URI=https://your-server.example/auth/callback
```

The matching WorkOS AuthKit redirect URI must be configured in the WorkOS dashboard.

Web environment variables:

```sh
VITE_SERVER_URL=https://your-server.example
```

Admin environment variables:

```sh
VITE_SERVER_URL=https://your-server.example
```
