# Simmer Mosquito

Nx-managed pnpm monorepo for mosquito control and surveillance software.

## Workspace Layout

- `apps/server`: Hono HTTP control plane for auth, sync proxies, and command endpoints.
- `apps/worker`: Background worker for scheduled surveillance/control jobs.
- `packages/config`: Shared environment parsing.
- `packages/db`: SQL migrations and Kysely/Postgres helpers.
- `packages/auth`: WorkOS AuthKit/session helpers.
- `packages/domain`: Shared domain types and calculations.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm dev:server
pnpm dev:worker
pnpm graph
```

## Railway Notes

Create one Railway service per deployable app. For the server service, use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @simmer-mosquito/server build`
- Start command: `pnpm --filter @simmer-mosquito/server start`

The server binds to `0.0.0.0` and reads Railway's `PORT` environment variable.

Server environment variables:

```sh
APP_ORIGIN=https://your-web-app.example
DATABASE_URL=${{Postgres.DATABASE_URL}}
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=at-least-32-characters
WORKOS_REDIRECT_URI=https://your-server.example/auth/callback
```

The matching WorkOS AuthKit redirect URI must be configured in the WorkOS dashboard.
