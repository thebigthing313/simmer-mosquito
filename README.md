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
pnpm dev:worker
pnpm graph
```

On Windows or from Codex automation, prefer `pnpm.cmd ...` as described in
`AGENTS.md`.

## Workspace

- `apps/admin`: SIMMER operator control-plane SPA.
- `apps/preview`: internal design-system and component preview app.
- `apps/server`: Hono HTTP control plane for auth, sync proxies, and command
  endpoints.
- `apps/web`: agency-facing Vite React SPA shell.
- `apps/worker`: background worker for scheduled jobs.
- `packages/auth`: WorkOS AuthKit/session helpers.
- `packages/config`: shared environment parsing.
- `packages/db`: SQL migrations and Kysely/Postgres helpers.
- `packages/design-tokens`: framework-free visual tokens.
- `packages/domain`: shared domain types, commands, validators, and helpers.
- `packages/ui-web`: shared web UI components, styles, and semantic icon
  registry.

## Testing

Fast tests run through each package's `pnpm test` script. Postgres-backed DB
integration tests are opt-in and require an explicit test database URL.

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
- `docs/plan.md`: current boundary, next slice, and deferred work.
