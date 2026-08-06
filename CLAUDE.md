# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SIMMER (Strategic Integrated Mosquito Management Enterprise Resources) is mosquito control and surveillance software for mosquito control agencies. It is an Nx-managed pnpm monorepo. The architecture is Postgres-centered, sync-native, and multi-tenant: WorkOS owns auth identity, SIMMER owns agency data and all authorization decisions.

## Commands

Run from the workspace root. On Windows / from automation, prefer the `.cmd` shim (`pnpm.cmd ...`) to avoid PowerShell/Corepack PATH issues with workspace binaries.

```sh
pnpm install
pnpm build          # nx run-many -t build (tsgo)
pnpm typecheck      # nx run-many -t typecheck (tsgo)
pnpm check          # biome check . (lint + format + import organize)
pnpm check:write    # biome check --write . — apply fixes
pnpm test           # nx run-many -t test (vitest)
pnpm graph          # nx project graph
```

Per-app dev servers: `pnpm dev:server`, `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:preview`. `pnpm dev:caddy` runs the local reverse proxy (`Caddyfile.local`).

### Rot gates

CI's `verify` job runs three `fallow` checks, and all three are also runnable locally:

```sh
pnpm fallow dead-code   # unused code, cycles, unresolved imports — gated at zero
pnpm fallow dupes       # duplication, ratcheted at the threshold in .fallowrc.jsonc
pnpm fallow:health      # complexity, compared against .fallow-baseline/health.json
pnpm fallow:baseline    # re-save the complexity baseline after real complexity comes out
```

Duplication and complexity are gated **against where the workspace already is**, not against zero: the backlog is thousands of lines and hundreds of units, so an absolute gate would fail every branch on history. Read both as "did this branch make it worse". Lowering the duplication threshold or re-saving the complexity baseline is normal after a cleanup — but a re-saved baseline can also bury a regression, so read the diff.

Scope a task to one project with Nx or pnpm filters:

```sh
nx test @simmer-mosquito/domain
pnpm --filter @simmer-mosquito/domain test
nx test @simmer-mosquito/domain -- src/tests/some.test.ts   # single test file
```

### Build toolchain (tsgo vs tsc)

`tsgo` (`@typescript/native-preview`) is the **default** for `build`/`typecheck`. Each project also defines `:ts6` (stable `tsc`) and `:ts7` (tsgo) fallback targets — use them when tsgo misbehaves: `pnpm build:ts6`, `pnpm typecheck:ts6`. (Note: a `typcheck:ts6` typo alias exists in scripts for compatibility; don't propagate it.)

### Database

SQL migrations are the **source of truth**; dbmate applies them, Kysely is the server query builder.

```sh
pnpm db:migrate     # dbmate up   (packages/db/migrations -> packages/db/schema.sql)
pnpm db:rollback
pnpm db:status
```

Fast tests are pure (no DB). Postgres-backed integration tests (`*.integration.test.ts`) are **opt-in** and require an explicit test DB. They live in `packages/db` and in `apps/server` — the latter for the ownership and lifecycle reads that decide whether a write happens, which take a plain `Transaction` and no server context. `apps/server` imports the harness from `@simmer-mosquito/db/test-support`, so `packages/db` must be built first.

```sh
# PowerShell — point at the Railway staging Postgres in .env:
$env:TEST_DATABASE_URL=(Get-Content .env | Select-String '^DATABASE_URL=').ToString().Substring(13)
pnpm --filter @simmer-mosquito/db test
pnpm --filter @simmer-mosquito/server test
```

Each test builds a throwaway `simmer_test_*` schema, applies every migration into it, and drops it afterwards — `public` is never touched. Against a remote database that is ~10s per test, so `describeDbIntegration` sets its own long timeout; do not run these suites under vitest's default. Without `TEST_DATABASE_URL` they **skip silently**, so a green `pnpm test` does not mean they ran.

**Local dev backends:** `apps/server` + frontends run locally; Postgres + Electric come from the Railway `staging` environment (`.env`/`apps/server/.env` point `DATABASE_URL`/`ELECTRIC_URL`/`ELECTRIC_SECRET` at staging). There is no local Docker Postgres. See `docs/deployment.md` → "Local development". Deploys are gated on `pnpm test` passing (`verify` job) — keep tests green or nothing deploys; pushing `main` is a production release.

## Architecture

Authoritative docs (read before non-trivial work):
- `docs/architecture.md` — full system shape.
- `docs/adr/` — accepted architecture decisions (0001–0009); read the relevant ADR before changing auth, sync, identity, tenancy, or DB layering.
- `CONTEXT.md` — domain glossary (load often); `docs/*-domain.md` — per-domain command vocabulary.
- `docs/sync.md` — the table-level Electric/TanStack DB sync matrix (eager vs on-demand per table).
- `docs/domain-command-contract.md` — command/validation/offline rules.

### Apps and packages

- `apps/server` — Hono control plane. Owns WorkOS callbacks, session cookies, `AuthContext` resolution, Electric shape authorization, command endpoints, authenticated MVT map tiles, and **all server-authorized Postgres writes**.
- `apps/web` — agency-facing Vite + React + TanStack Router SPA. Online-only in v1.
- `apps/admin` — SIMMER **operator** (platform-side) control plane, not agency administration. Org creation/support, invitations, global taxonomy, global units.
- `apps/preview` — internal design-system / component preview app (not a product surface).
- `packages/domain` — framework-agnostic domain types, command builders, validators. Stable public seams are top-level barrel modules (e.g. `control-operations.ts`); large domains split into matching folders behind them. Tests live in `packages/domain/src/tests`.
- `packages/db` — dbmate migrations, Kysely/Postgres helpers, generated DB types.
- `packages/sync` — framework-agnostic TanStack DB collection factories, Electric shape descriptors, row schemas, optimistic command adapters.
- `packages/mapping` — provider-neutral geometry/GeoJSON/viewport helpers.
- `packages/auth` — WorkOS AuthKit/session helpers. `packages/config` — env parsing. `packages/design-tokens` — framework-free visual tokens. `packages/ui-web` — shared shadcn/Radix/Tailwind component source + semantic icon registry.

Shared packages avoid React and platform-specific storage unless their name says otherwise.

### Data flow (critical model)

Reads are sync-native — clients never talk to Postgres or unrestricted Electric directly:
```
Postgres -> ElectricSQL -> TanStack DB -> UI
```
The **server authorizes every sync shape** before Electric streams. Shape proxy routes force the authorized table/columns/scope server-side and ignore caller-provided `table`/`columns`/`where`.

Writes go through domain commands (intent, not DB patches), applied as TanStack DB optimistic mutations, sent to a Hono command endpoint, committed in a Kysely transaction, then confirmed via Electric sync. Commands use client-generated UUIDs and carry domain actor ids + operational dates so they are replay/audit-safe.

### Authorization & identity

- Server-side authorization, **not** Postgres RLS. The server resolves `AuthContext` (WorkOS user, SIMMER user, organization, profile, membership, role) from the WorkOS sealed session cookie and authorizes sync shapes + command endpoints.
- Identity model: `users` (WorkOS-linked logins), `organizations` (= **Agency**, WorkOS-linked), `profiles` (org-scoped people for attribution; may exist without login), `memberships` (current user↔org↔profile↔role↔status). Use the domain vocabulary in `CONTEXT.md` (Agency, Profile, Membership — not tenant/user/account).
- Tenancy: `organization_id` lives on tenant-owned root records; children derive tenant via FKs. Add `organization_id` to child tables only when query/sync/indexing pressure proves it useful.

### Validation boundary

Pure domain builders validate context-free rules (required fields, enums, ranges, date shape, mutually-exclusive fields, normalization). Server command handlers validate context-dependent rules (org ownership, role auth, referenced-row existence, lifecycle, uniqueness/concurrency, geometry source lookup/snapshot).

## Conventions

- **Skills**: before substantial work, check local skills (`pnpm.cmd dlx @tanstack/intent@latest list`) and load the most specific matching one with `... load <package>#<skill>`.
- **TanStack Router**: file-based routing. Keep generated `src/routeTree.gen.ts` committed and never hand-edit it. Configure the Vite router plugin with `autoCodeSplitting: true`.
- **UI/styling**: compose `packages/ui-web` shadcn primitives before writing custom JSX; promote reused patterns into `ui-web` as `cva` variants. Style with Tailwind semantic tokens + shadcn variants — route-level `className` should mostly be layout. Import icons from `@simmer-mosquito/ui-web/icons/registry`, not `lucide-react` directly. Keep durable raw values in `packages/design-tokens`. App CSS is reserved for globals, token exposure, vendor/browser selectors, and cases Tailwind can't express. See `AGENTS.md` and `DESIGN.md` for the full rules.
- **Formatting/lint**: Biome (`pnpm check`). Tabs (width 2), LF, single quotes, semicolons, trailing commas, 100-col. Generated files (`routeTree.gen.ts`, `packages/ui-web/src/components/ui`, `dist`) are excluded.
- **Location-bearing commands** carry a domain *location source* (explicit GeoJSON or an allowed same-org locatable record), never raw DB geometry columns. The server stores/snapshots geometry inside the authorized transaction. See per-domain docs for allowed source flows.
