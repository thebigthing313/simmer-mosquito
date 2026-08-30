# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Writing style (always on)

Read `docs/writing-style.md` before writing prose and apply it to everything you
emit: chat replies, commit messages, PR bodies, changesets, docs, code comments,
and UI copy. It is the `unslop` rule set, checked in. No trigger phrase, no
opt-in. If the `unslop` skill is available, treat it as loaded for every turn;
if it is not, the checked-in doc is the whole rule.

## What this is

SIMMER (Strategic Integrated Mosquito Management Enterprise Resources) is mosquito control and surveillance software for mosquito control agencies. It is an Nx-managed pnpm monorepo. The architecture is Postgres-centered, sync-native, and multi-tenant: WorkOS owns auth identity, SIMMER owns agency data and all authorization decisions.

## Commands

Run from the workspace root. On Windows and from automation, prefer the `.cmd` shim (`pnpm.cmd ...`) to avoid PowerShell/Corepack PATH issues with workspace binaries.

```sh
pnpm install
pnpm build          # nx run-many -t build (tsc)
pnpm typecheck      # nx run-many -t typecheck (tsc)
pnpm check          # biome check . (lint + format + import organize)
pnpm check:write    # biome check --write . applies fixes
pnpm test           # nx run-many -t test (vitest)
pnpm graph          # nx project graph
```

Per-app dev servers: `pnpm dev:server`, `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:preview`. `pnpm dev:caddy` runs the local reverse proxy (`Caddyfile.local`).

### Releases

`apps/web` and `apps/admin` are versioned independently (both from 0.1.0) and each publishes its history at `/changelog`, linked from the version under the sidebar logo.

**All work happens on a branch**, merged to `staging`, and `staging` is promoted to `main` to release. A branch that changes what a user can do carries a changeset; refactors, tests, tooling, and docs do not.

A changeset is a changelog entry, **not** a version bump. Every promotion bumps both apps whether or not anything was pending. A refactor that ships is a build somebody is running, and the number is how they report it. `pnpm release:version` writes the `patch` itself for an app no changeset named, and the release draws as a maintenance one. So never file a changeset just to move a version.

```sh
pnpm changeset          # write one; the body starts with Added:, Changed:, or Fixed:
pnpm changeset:status   # what is pending on this branch
pnpm release:version    # promotion only: consume changesets, bump versions, stamp dates
```

Only the two apps are versioned; every other package is in `ignore`, so a `packages/ui-web` or `apps/server` change is filed against the app whose surface it changes. Read `docs/releases.md` before changing any of this.

### Rot gates

CI's `verify` job runs three `fallow` checks, and all three are also runnable locally:

```sh
pnpm fallow dead-code   # unused code, cycles, unresolved imports, gated at zero
pnpm fallow dupes       # duplication, ratcheted at the threshold in .fallowrc.jsonc
pnpm fallow:health      # complexity, compared against .fallow-baseline/health.json
pnpm fallow:baseline    # re-save the complexity baseline after real complexity comes out
```

Duplication and complexity are gated **against where the workspace already is**, not against zero: the backlog is thousands of lines and hundreds of units, so an absolute gate would fail every branch on history. Read both as "did this branch make it worse". Lowering the duplication threshold or re-saving the complexity baseline is normal after a cleanup, but a re-saved baseline can also bury a regression, so read the diff.

Five cheap static gates run in the same job and are not `fallow`. `pnpm check:build-graph` is below, under the build toolchain. `pnpm check:command-columns` reads every `snake_case` key an intent handler in `apps/server/src/table-commands/` reads and requires it to be a column of that handler's table, from the generated row schemas. `payload` is a loose record, so a misspelled or renamed column compiles, reads `undefined`, and answers 200 having dropped the field. `pnpm check:write-references` requires every write that names another record's id to go through the reference gate, because a foreign key is satisfied by the row existing in any agency. See `docs/domain-command-contract.md` for those two. `pnpm check:search-corpus` holds the `SEARCH_CORPUS` declaration in `packages/db/src/domains/search.ts` to the generated row schemas, to the withholding rule in `scripts/withheld-columns.mjs`, and to the tables the search migration creates triggers on: the index is a second copy of the corpus tables' text, read back over an endpoint with no column list of its own, so a field that is not a column silently indexes nothing and a withheld column silently goes back on the wire. `pnpm check:acknowledgements` holds the acknowledgement vocabulary in `packages/domain/src/acknowledgements.ts`, the flags declared on command payloads, and `ACKNOWLEDGEMENT_MECHANISMS` in `apps/server/src/acknowledgements.ts` to each other, and ratchets `UNCHECKED_ACKNOWLEDGEMENTS`: a flag lives beside the command that needs it, so nothing used to count the set, and #165 found seventy-three of them declared and none read.

Scope a task to one project with Nx or pnpm filters:

```sh
nx test @simmer-mosquito/domain
pnpm --filter @simmer-mosquito/domain test
nx test @simmer-mosquito/domain -- src/tests/unit/foundation.test.ts   # single test file
```

### Where tests live

Every app and package keeps its suites in `<project>/src/tests/`, split by kind
into `unit/` and `integration/` (`e2e/` when one exists), and mirroring the `src`
tree below that. `apps/web/src/lib/local-date.ts` is covered by
`apps/web/src/tests/unit/lib/local-date.test.ts`. Nothing is colocated with the
code it covers. Assets a test owns, such as a `__snapshots__` folder, sit beside
the test in its new home.

They stay under `src` rather than beside it because every project compiles
`src/**/*` and a test that is not typechecked is where a wrong enum member
hides; `vitest.shared.ts` is what keeps the compiled copy in `dist` from being
collected a second time.

**One directory is excepted: `apps/server/src/tests/unit/table-commands/`.** Its
suites are grouped by surface rather than by module, so many of them are named
for a group of tables that are written together and span two to four modules.
`larval-surveillance.test.ts` covers `habitats.ts`, `inspections.ts`,
`samples.ts`, and `sample-species.ts`. Files whose surface is one module, such as
`taxonomy.test.ts` and `units.test.ts`, are named for it, and both shapes are
correct here. The reason is fixtures. The modules on one surface need the same
auth context, the same organization settings, and the same ids, so a file per
module would copy that setup into several thin files.

A surface is not the same unit as a domain in `CONTEXT.md`, and one domain can
hold several suites. Field-work support is the case to know: `fieldWork.*`
commands are covered by `tags.test.ts` for the Tag catalog,
`field-work.test.ts` for the routes and assignments worklist, and
`polymorphic-support.test.ts` for the three `entity_type`/`entity_id` link
tables. So a new file is for a surface that has none, and a test whose surface
already has a suite goes in that suite. To find what covers a module, read the
imports at the top of the files rather than the file names, or grep the
directory for the module's `*TableCommands` export.

`writer-coverage.test.ts` is a third case and follows neither convention. It
asserts over every table at once, that each declared intent is one its writer
handles, so it is not a test of any one module and is not named for one.

### Build toolchain

The workspace is on **TypeScript 7** (`typescript@7.0.2`, the native compiler), and `tsc` is the only compiler: every project's `build` is `tsc -b` and every `typecheck` is `tsc -p tsconfig.json --noEmit --pretty false`. There are no per-compiler fallback targets. The old `:ts6` (TypeScript 6 `tsc`) and `:ts7` (`tsgo` from `@typescript/native-preview`) variants, and the `typcheck:ts6` typo alias, are gone. Don't reintroduce a second compiler path; if `tsc` misbehaves, fix it or pin the version at the root.

**A cross-package import needs a tsconfig `references` entry, not only a dependency.** Which project depends on which is declared twice. Nx orders `pnpm build` and `pnpm typecheck` from package.json dependencies; `tsc -b` orders from tsconfig `references`. Every deploy runs `pnpm --filter <app> build`, which is `tsc -b` alone, so a missing reference is green in CI and red on the deploy. That is #175. It hides locally too, because a `dist` left by any earlier full build satisfies the import. `pnpm check:build-graph` asserts the two graphs name the same edges; CI's `Shipped build` job builds each app the way its Dockerfile does, on a clean tree.

The root `tsconfig.json` is a third declaration: a solution file whose `references` are the whole of what `tsc -b` at the root builds. No script runs it, so an incomplete one used to be invisible, and it named 8 of 12 projects while a root build still exited 0 (#178). `check:build-graph` now also asserts the solution names every workspace project, so **a new project needs an entry there too**.

One deliberate exception, in `pnpm.packageExtensions` at the root: **Nx gets its own private `typescript@6.0.3`**. Nx's project-graph plugins (`@nx/js/typescript` and the built-in `nx/js/dependencies-and-lockfile`) `require('typescript')` and call the classic JS compiler API (`ts.readConfigFile`, `ts.Extension`), which TypeScript 7's package no longer exposes. Handed TS 7 they die with `tsModule.readConfigFile is not a function` and the whole graph fails to build, so nothing runs. This is still true on the latest Nx (23.x), so it is not fixed by upgrading. The extension pins TS 6 *inside* Nx's own `node_modules`, where Node's resolution finds it before walking up to the root, so nothing the workspace compiles ever sees it. Drop the extension only once Nx stops needing the legacy API.

### Database

SQL migrations are the **source of truth**; dbmate applies them, Kysely is the server query builder.

```sh
pnpm db:migrate     # dbmate up   (packages/db/migrations -> packages/db/schema.sql)
pnpm db:rollback
pnpm db:status
```

Fast tests are pure (no DB). Postgres-backed integration tests (`*.integration.test.ts`) are **opt-in** and require an explicit test DB. They live in `packages/db/src/tests/integration` and `apps/server/src/tests/integration`, the latter for the ownership and lifecycle reads that decide whether a write happens, which take a plain `Transaction` and no server context. `apps/server` imports the harness from `@simmer-mosquito/db/test-support`, so `packages/db` must be built first.

```sh
# PowerShell. Point at the Railway staging Postgres in .env:
$env:TEST_DATABASE_URL=(Get-Content .env | Select-String '^DATABASE_URL=').ToString().Substring(13)
pnpm --filter @simmer-mosquito/db test
pnpm --filter @simmer-mosquito/server test
```

Each test builds a throwaway `simmer_test_*` schema, applies every migration into it as a single query, and drops it afterwards, so `public` is never touched. Against a remote database that is ~9s per test, so `describeDbIntegration` sets its own 45s timeout; do not run these suites under vitest's default. Without `TEST_DATABASE_URL` they **skip silently**, so a green `pnpm test` does not mean they ran.

A local container has to be started for that: several files build their schemas at once, so the lock table holds every object of all of them and the stock `max_locks_per_transaction=64` fails twelve files at once with `out of shared memory` (SQLSTATE 53200). `docker-compose.yml` starts Postgres with `max_locks_per_transaction=1024` and creates `postgis`, `pgcrypto`, `pg_trgm` and `btree_gin` in `public` first, so the migrations' `create extension if not exists` is the no-op it is against staging; a hand-started container needs both.

CI does not use staging for this. The `Database integration tests` job runs a `postgis/postgis:17-3.5` service container, the version staging runs, and points `TEST_DATABASE_URL` at loopback, so nothing CI does reaches the database your dev server is talking to.

**Local dev backends:** `apps/server` and the frontends run locally; Postgres and Electric come from the Railway `staging` environment (`.env` and `apps/server/.env` point `DATABASE_URL`, `ELECTRIC_URL`, and `ELECTRIC_SECRET` at staging). That is mode A and the default; `docker-compose.yml` still runs a fully local Postgres and Electric as mode B. See `docs/deployment.md`, "Local development". Deploys are gated on `pnpm test` passing (`verify` job), so keep tests green or nothing deploys. Pushing `main` is a production release.

## Architecture

Authoritative docs (read before non-trivial work):
- `docs/architecture.md`: full system shape.
- `docs/adr/`: accepted architecture decisions (0001 to 0015). Read the relevant ADR before changing auth, sync, identity, tenancy, DB layering, field-work provenance, or region membership. **0013 is accepted and built**: every identity write is a domain command in the `identity.*` namespace, including the four on `/commands/memberships` that also settle WorkOS. `IDENTITY_FLOORS` is gone and every floor is in `COMMAND_PERMISSIONS`. `people.listMemberships` stays REST, because it is a read behind a POST. **0014 amends 0007**: read both for sync, because the package boundary is 0007's and the mechanism is 0014's. **0015 is accepted and built for web**: region membership is computed on read, and area versus area needs interiors to meet, which amends the plain-intersection rule the Region multiselect shipped under. One predicate in `packages/db/src/domains/map-region-filter.ts` serves both the multiselect and `GET /records/:recordType/:recordId/regions`, and the hand-written corpus behind `@simmer-mosquito/mapping/test-corpus` is what holds it. Mobile's TypeScript half is specced and unbuilt, and the corpus is the gate it passes. `docs/region-membership-spec.md` is the rest.
- `CONTEXT.md`: domain glossary (load often). `docs/*-domain.md`: per-domain command vocabulary.
- `docs/sync.md`: the table-level Electric/TanStack DB sync matrix (eager vs on-demand per table).
- `docs/domain-command-contract.md`: command, validation, and offline rules, plus the `/commands/{table}` write surface: which endpoint a new command goes on, the two halves declaring one takes, and the `snake_case`/`camelCase` rule for a body's keys. Read it before adding a command.

### Apps and packages

- `apps/server`: Hono control plane. Owns WorkOS callbacks, session cookies, `AuthContext` resolution, Electric shape authorization, command endpoints, authenticated MVT map tiles, and **all server-authorized Postgres writes**.
- `apps/web`: agency-facing Vite + React + TanStack Router SPA. Online-only in v1.
- `apps/admin`: SIMMER **operator** (platform-side) control plane, not agency administration. Org creation and support, invitations, global taxonomy, global units.
- `apps/preview`: internal design-system and component preview app, not a product surface.
- `packages/domain`: framework-agnostic domain types, command builders, validators. Each domain is a folder under `src` with its own `index.ts` (`control-operations/`, `field-work/`, `mission-dispatch/`); the package exports one public entry, `src/index.ts`. Tests live in `packages/domain/src/tests/unit`.
- `packages/db`: dbmate migrations, Kysely/Postgres helpers, generated DB types.
- `packages/sync`: framework-agnostic TanStack DB collection factories, per-table row schemas generated from the database (`src/collections/tables`), and the optimistic write path (`src/collections/functions`) that turns a mutation into a named domain command.
- `packages/mapping`: provider-neutral geometry, GeoJSON, and viewport helpers.
- `packages/auth`: WorkOS AuthKit and session helpers. `packages/config`: env parsing. `packages/design-tokens`: framework-free visual tokens. `packages/ui-web`: shared shadcn/Radix/Tailwind component source and the semantic icon registry.

Shared packages avoid React and platform-specific storage unless their name says otherwise.

### Data flow (critical model)

Reads are sync-native. Clients never talk to Postgres or unrestricted Electric directly:
```
Postgres -> ElectricSQL -> TanStack DB -> UI
```
The **server authorizes every sync shape** before Electric streams. Shape proxy routes force the authorized table/columns/scope server-side and ignore caller-provided `table`/`columns`/`where`.

Writes go through domain commands (intent, not DB patches), applied as TanStack DB optimistic mutations, sent to a Hono command endpoint, committed in a Kysely transaction, then confirmed via Electric sync. Commands use client-generated UUIDs and carry domain actor ids and operational dates so they are replay-safe and audit-safe.

The command endpoint is one per table, `POST|PATCH|DELETE /commands/{table}`, and the body's `intents` list names the commands the write means rather than letting the server infer them from which fields arrived. `apps/server/src/table-commands/` is 54 tables and 272 of the 281 names in the vocabulary. The nine that are not on it, the older per-domain endpoints, and the rules for adding a command are in `docs/domain-command-contract.md`.

### Authorization and identity

- Server-side authorization, **not** Postgres RLS. The server resolves `AuthContext` (WorkOS user, SIMMER user, organization, profile, membership, role) from the WorkOS sealed session cookie and authorizes sync shapes and command endpoints.
- Identity model: `users` (WorkOS-linked logins), `organizations` (= **Agency**, WorkOS-linked), `profiles` (org-scoped people for attribution; may exist without login), `memberships` (current user↔org↔profile↔role↔status). Use the domain vocabulary in `CONTEXT.md`: Agency, Profile, Membership, never tenant, user, or account.
- Tenancy: `organization_id` lives on tenant-owned root records; children derive tenant via FKs. Add `organization_id` to child tables only when query, sync, or indexing pressure proves it useful.

### Validation boundary

Pure domain builders validate context-free rules (required fields, enums, ranges, date shape, mutually-exclusive fields, normalization). Server command handlers validate context-dependent rules (org ownership, role auth, referenced-row existence, lifecycle, uniqueness and concurrency, geometry source lookup and snapshot).

## Conventions

- **Skills**: before substantial work, check local skills (`pnpm.cmd dlx @tanstack/intent@latest list`) and load the most specific matching one with `... load <package>#<skill>`.
- **TanStack Router**: file-based routing. Keep generated `src/routeTree.gen.ts` committed and never hand-edit it. Configure the Vite router plugin with `autoCodeSplitting: true`.
- **UI and styling**: compose `packages/ui-web` shadcn primitives before writing custom JSX; promote reused patterns into `ui-web` as `cva` variants. Style with Tailwind semantic tokens and shadcn variants, and keep route-level `className` to layout. Import icons from `@simmer-mosquito/ui-web/icons/registry`, not `lucide-react` directly. Keep durable raw values in `packages/design-tokens`. App CSS is reserved for globals, token exposure, vendor and browser selectors, and cases Tailwind can't express. See `AGENTS.md` and `DESIGN.md` for the full rules.
- **Formatting and lint**: Biome (`pnpm check`). Tabs (width 2), LF, single quotes, semicolons, trailing commas, 100-col. Generated files (`routeTree.gen.ts`, `packages/ui-web/src/components/ui`, `dist`) are excluded.
- **Location-bearing commands** carry a domain *location source* (explicit GeoJSON or an allowed same-org locatable record), never raw DB geometry columns. The server stores and snapshots geometry inside the authorized transaction. See per-domain docs for allowed source flows.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `thebigthing313/simmer-mosquito`, driven by the
`gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their own names as label strings, over the
`bug` and `enhancement` categories. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` and one `docs/adr/`, covering every app
and package. See `docs/agents/domain.md`.
