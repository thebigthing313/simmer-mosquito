# Simmer Mosquito

Nx-managed pnpm monorepo for mosquito control and surveillance software.

## Workspace Layout

- `apps/api`: Node HTTP API intended for Railway web services.
- `apps/worker`: Background worker for scheduled surveillance/control jobs.
- `packages/config`: Shared environment parsing.
- `packages/domain`: Shared domain types and calculations.

## Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm dev:api
pnpm dev:worker
pnpm graph
```

## Railway Notes

Create one Railway service per deployable app. For the API service, use:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @simmer-mosquito/api build`
- Start command: `pnpm --filter @simmer-mosquito/api start`

The API binds to `0.0.0.0` and reads Railway's `PORT` environment variable.

