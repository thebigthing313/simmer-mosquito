# Simmer Mosquito

Nx-managed pnpm monorepo for mosquito control and surveillance software.

## Workspace Layout

- `apps/server`: Hono HTTP control plane for auth, sync proxies, and command endpoints.
- `apps/web`: Vite React SPA shell for browser auth and future agency workflows.
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
pnpm dev:web
pnpm dev:worker
pnpm graph
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the current system shape
and [docs/adr](docs/adr) for accepted architecture decisions.

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

Web environment variables:

```sh
VITE_SERVER_URL=https://your-server.example
```
