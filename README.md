# Simmer Mosquito

Nx-managed pnpm monorepo for mosquito control and surveillance software.

## Quickstart

```sh
pnpm install
pnpm build
pnpm typecheck
```

Common dev targets:

```sh
pnpm dev:admin
pnpm dev:preview
pnpm dev:server
pnpm dev:web
pnpm graph
```

On Windows or from Codex automation, prefer `pnpm.cmd ...` as described in
`AGENTS.md`.

## Local development

`apps/server` and the frontends always run locally. Postgres + Electric come from
one of two backends. See `docs/deployment.md`, "Local development", for the full
setup:

- **Railway-backed (recommended default):** point `DATABASE_URL` / `ELECTRIC_URL`
  / `ELECTRIC_SECRET` in `.env` + `apps/server/.env` at the Railway `staging`
  environment. No local Docker; frees resources and avoids flaky local Electric.
  Seed realistic data with `scripts/clone-prod-to-staging.ps1`.
- **Fully local Docker:** `docker compose up -d postgres electric`, then
  `pnpm db:migrate` and the sync-baseline seed (`.env.example` values).

Either way: `pnpm dev:server`, `pnpm dev:web`, `pnpm dev:caddy` (HTTPS/HTTP2 front
at `https://localhost:5175`).

## Workspace

- `apps/admin`: SIMMER operator control-plane SPA.
- `apps/preview`: internal design-system and component preview app.
- `apps/server`: Hono HTTP control plane for auth, sync proxies, and command
  endpoints.
- `apps/web`: agency-facing Vite React SPA shell.
- `packages/auth`: WorkOS AuthKit/session helpers.
- `packages/config`: shared environment parsing.
- `packages/db`: SQL migrations and Kysely/Postgres helpers.
- `packages/design-tokens`: framework-free visual tokens.
- `packages/domain`: shared domain types, commands, validators, and helpers.
- `packages/ui-web`: shared web UI components, styles, and semantic icon
  registry.

## Testing

Fast tests run through each package's `pnpm test` script. Postgres-backed DB
integration tests are opt-in and require an explicit test database URL; without
one they skip silently, so a green `pnpm test` does not mean they ran.

Each test applies the whole migration set into a throwaway `simmer_test_*`
schema and drops it afterwards. Point `TEST_DATABASE_URL` at any PostGIS-capable
Postgres: the Railway staging URL from `.env`, or a local container.

```sh
docker-compose up -d postgres
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/simmer_mosquito pnpm --filter @simmer-mosquito/db test
```

PowerShell:

```powershell
docker-compose up -d postgres
$env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/simmer_mosquito'
pnpm --filter @simmer-mosquito/db test
```

`docker-compose up -d postgres` is the path that works out of the box. Several
files build their schemas at once, so the lock table holds every object of all
of them, and the stock `max_locks_per_transaction=64` fails twelve files at once
with `out of shared memory` (SQLSTATE 53200); the compose service raises it to
1024. It also creates `postgis`, `pgcrypto`, `pg_trgm` and `btree_gin` in
`public` on an empty volume, so the migrations' `create extension if not exists`
is the no-op it is against staging rather than a race between schemas. A
hand-started container needs both.

CI runs the same suites against its own `postgis/postgis:17-3.5` service
container, matching the version staging runs. It does not use staging, so
nothing CI does touches a database anyone else is using.

## Docs

- `AGENTS.md`: always-on agent and repo workflow instructions.
- `CONTEXT.md`: lightweight domain glossary and doc index.
- `PRODUCT.md`: product audience, brand, and strategy.
- `DESIGN.md`: visual language and component design rules.
- `docs/architecture.md`: current system shape.
- `docs/adr/`: accepted architecture decisions.
- `docs/deployment.md`: local, staging, production, Railway, WorkOS, and GitHub
  Actions setup.
- `docs/sync.md`: Electric/TanStack DB sync matrix and tracer notes.
- `docs/domain-command-contract.md`: shared command, validation, offline, and
  module-shape rules.
- `docs/*-domain.md`: domain-specific command vocabulary and exceptions.
