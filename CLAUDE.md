# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Writing style (always on)

Read `docs/writing-style.md` before writing prose and apply it to everything you
emit: chat replies, commit messages, PR bodies, changesets, docs, code comments,
and UI copy. It is the `unslop` rule set, checked in. No trigger phrase, no
opt-in. If the `unslop` skill is available, treat it as loaded for every turn;
if it is not, the checked-in doc is the whole rule.

## What this is

SIMMER (Strategic Integrated Mosquito Management Enterprise Resources) is mosquito control and surveillance software for mosquito control organizations. It is an Nx-managed pnpm monorepo. The architecture is Postgres-centered and sync-native, with one deployment serving many organizations: WorkOS owns auth identity, SIMMER owns organization data and all authorization decisions.

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

The flow is `feature branch` -> `develop` -> `staging` -> `main`. **All work happens on a branch**, PR'd into `develop`, which is the default branch and deploys nothing. `develop` to `staging` is a reviewed PR and is **where the release is cut**; merging it starts the soak. `staging` to `main` is a fast-forward push (`git push origin origin/staging:main`), not a forced one, so what ships is the commit that soaked and git refuses the push outright when `main` holds a hotfix `staging` never got. A branch that changes what a user can do carries a changeset; refactors, tests, tooling, and docs do not.

A changeset is a changelog entry, **not** a version bump. Every cut bumps both apps whether or not anything was pending. A refactor that ships is a build somebody is running, and the number is how they report it. `pnpm release:version` writes the `patch` itself for an app no changeset named, and the release draws as a maintenance one. So never file a changeset just to move a version. A version names the **release candidate** from the cut onward; `main` fast-forwards a number that already exists.

```sh
pnpm changeset          # write one; the body starts with Added:, Changed:, or Fixed:
pnpm changeset:status   # what is pending on this branch
pnpm release:version    # the cut: consume changesets, bump versions, stamp dates
```

The cut cannot be committed on `develop`, which takes no direct pushes, so run `pnpm release:version` on a branch off `develop`, PR that into `develop`, then open the `develop` to `staging` PR carrying it. Two `ci.yml` jobs gate this and are required on all three branches: `Changeset filed (or declined)` on PRs based on `develop`, `Release cut (or declined)` on PRs based on `staging`, overridden by the `no changeset` and `release cut declined` labels. `Release cut (or declined)` also refuses a promotion while `main` holds commits `develop` does not, which is a hotfix that never finished step 6 of the hotfix path. Both report `skipping` on a push, which is normal.

Only the two apps are versioned; every other package is in `ignore`, so a `packages/ui-web` or `apps/server` change is filed against the app whose surface it changes. Read `docs/releases.md` before changing any of this.

### Rot gates

CI's `verify` job runs three `fallow` checks, and all three are also runnable locally:

```sh
pnpm fallow dead-code   # unused code, cycles, unresolved imports, gated at zero
pnpm fallow dupes       # duplication, ratcheted at the threshold in .fallowrc.jsonc
pnpm fallow:health      # complexity, compared against .fallow-baseline/health.json
pnpm fallow:baseline    # re-save the complexity baseline after real complexity comes out
```

`dead-code` reads package source rather than build output, and that is what makes a local run and CI agree. A cross-package import resolves through the target's `exports`, which point at `dist/`, so the gate used to answer from whatever happened to be built in the checkout running it: unresolved imports in one that had never been built, a different answer fully built, a clean pass in CI, which runs it six steps before `pnpm build` (#334). Every export subpath that ships built output now carries a `fallow` condition naming the source behind it, and `.fallowrc.jsonc` asks for that condition. Nothing else reads it, so what the apps run is unchanged. **A new package owes the condition on every subpath that points at `dist/`, listed first**, and `pnpm check:build-graph` fails without it. First matters: fallow honours `types` as a built-in and takes the first key it matches, so a condition after `types` resolves to a `.d.ts` that an unbuilt checkout does not have, and is inert while looking like it works.

Duplication and complexity are gated **against where the workspace already is**, not against zero: the backlog is thousands of lines and hundreds of units, so an absolute gate would fail every branch on history. Read both as "did this branch make it worse". Lowering the duplication threshold or re-saving the complexity baseline is normal after a cleanup, but a re-saved baseline can also bury a regression, so read the diff.

A saved entry that matches no current finding is allowance nothing is using: the file it names was cleaned up, so a new finding there lands inside the old headroom and the gate stays quiet. `fallow` warns once a quarter of the saved entries match nothing, but it prints that ahead of 1500 lines of report and still exits 0, which is how the baseline sat five days with 358 of 658 entries matching nothing (#360). So `scripts/fallow.mjs` reprints the warning under the report and fails on it. A branch that trips it has cleaned real complexity out and should run `pnpm fallow:baseline`.

Eight cheap static gates run in the same job and are not `fallow`. `pnpm check:build-graph` is below, under the build toolchain. `pnpm check:write-references` requires every write that names another record's id to go through the reference gate, because a foreign key is satisfied by the row existing in any organization. See `docs/domain-command-contract.md`, which also carries the rule `check:command-columns` used to hold: a command body's keys are the table's columns, the acknowledgement vocabulary, and the keys that table declares, and `CommandPayload` in `apps/server/src/command-payload.ts` is that rule as a type, so a misspelled or renamed column fails `tsc` rather than reading `undefined` and answering 200 (#426). `pnpm check:search-corpus` holds the `SEARCH_CORPUS` declaration in `packages/db/src/domains/search.ts` to the generated row schemas, to the withholding rule in `scripts/withheld-columns.mjs`, and to the tables the search migration creates triggers on: the index is a second copy of the corpus tables' text, read back over an endpoint with no column list of its own, so a field that is not a column silently indexes nothing and a withheld column silently goes back on the wire. `pnpm check:geometry-policies` holds the geometry matrix to one register: `OWNED_GEOMETRY_POLICIES` in `packages/domain/src/shared.ts` says which record kind stores which shapes and in which of the 15 tables, and the gate asserts every kind has one row, no table sits on two, and no file outside the register writes a geometry-type list. It is at zero with no allowance, because the seven copies of the matrix agreed on the day four of them were deleted (ADR 0018). The database half is not static: reading the CHECKs out of migration text is a small SQL interpreter, so it is a case in `packages/db/src/tests/integration/owned-geometry.integration.test.ts` that reads the typmod and the constraint back out of the catalog. `pnpm check:tileset-keys` holds the client's eleven tileset names to the server's: `TILE_LAYER_BINDINGS` in `apps/web/src/components/map/tile-layers.ts` is the table a `MapCanvas` layer names, `createTileSetRegistry` in `apps/server/src/map-tiles.ts` is what `/map/tiles/:tileset` answers on, and the `*_SOURCE_ID` a client row names is the string that goes in the path. A name that disagrees 404s every tile and draws an empty basemap with nothing on screen to say why. `pnpm check:acknowledgements` holds the acknowledgement vocabulary in `packages/domain/src/acknowledgements.ts`, the flags declared on command payloads, and `ACKNOWLEDGEMENT_MECHANISMS` in `apps/server/src/acknowledgements.ts` to each other, and ratchets `UNCHECKED_ACKNOWLEDGEMENTS`: a flag lives beside the command that needs it, so nothing used to count the set, and #165 found seventy-three of them declared and none read. `pnpm check:column-vocabularies` holds the seventeen Postgres enum types to one register: `COLUMN_VOCABULARIES` in `packages/domain/src/column-vocabularies.ts` declares each as an `as const` array with its type derived from it, keyed by SQL type name. The gate compares the register to `packages/db/schema.sql` in `enumsortorder` order, holds the generated `z.enum` in `packages/sync/src/collections/tables/` to it, and refuses a member list written anywhere else, whether as an array, a union, a chain of `===` comparisons, or a Mapbox `match` spelled out arm by arm. Order is part of the contract, because it is what lets the density legend, the density select and the map ramp read one list instead of writing three. It is at zero with no allowance: Larval Density alone was in thirteen places and all seventeen agreed the day they were collapsed (#432). A `Record<LarvalDensity, string>` and a `switch` over the column are left alone, because the compiler already holds both to the union. The catalog half is a case in `packages/db/src/tests/integration/column-vocabularies.integration.test.ts`, which reads `pg_enum` and is what catches a stale dump. `pnpm check:table-types` runs `scripts/generate-table-types.mjs` and fails when `packages/db/src/tables.ts` is not what that generator emits from `packages/db/schema.sql`. The file is generated, not hand-owned, so the gate catches both a hand edit and a migration nobody regenerated after. It also refuses a dump whose applied versions are not the migration files on disk, because a stale dump makes every other answer green against a schema that does not exist. See ADR 0004.

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

**`apps/web/src/tests/unit/hooks/mutations/` is grouped the same way**, and for a
different reason. The suites there render a mutation hook and assert what it
dispatched, so each file has to stub every collection its hooks import, and
`vi.mock` hoists per file. One file per hook would write that stub block out
forty-three times. So a file is a write surface, `larval-surveillance.test.ts`
covers habitats, inspections, samples and species counts, and
`dispatch-harness.ts` beside them holds what the stub blocks share. The older
`use-*-mutations.test.ts` files in the same directory are not that: they test the
pure exported plan functions and need no stubs, so they stay named for the module
they cover.

### Build toolchain

The workspace is on **TypeScript 7** (`typescript@7.0.2`, the native compiler), and `tsc` is the only compiler: every project's `build` is `tsc -b` and every `typecheck` is `tsc -p tsconfig.json --noEmit --pretty false`. There are no per-compiler fallback targets. The old `:ts6` (TypeScript 6 `tsc`) and `:ts7` (`tsgo` from `@typescript/native-preview`) variants, and the `typcheck:ts6` typo alias, are gone. Don't reintroduce a second compiler path; if `tsc` misbehaves, fix it or pin the version at the root.

**A cross-package import needs a tsconfig `references` entry, not only a dependency.** Which project depends on which is declared twice. Nx orders `pnpm build` and `pnpm typecheck` from package.json dependencies; `tsc -b` orders from tsconfig `references`. Every deploy runs `pnpm --filter <app> build`, which is `tsc -b` alone, so a missing reference is green in CI and red on the deploy. That is #175. It hides locally too, because a `dist` left by any earlier full build satisfies the import. `pnpm check:build-graph` asserts the two graphs name the same edges; CI's `Shipped build` job builds each app the way its Dockerfile does, on a clean tree.

The root `tsconfig.json` is a third declaration: a solution file whose `references` are the whole of what `tsc -b` at the root builds. No script runs it, so an incomplete one used to be invisible, and it named 8 of 12 projects while a root build still exited 0 (#178). `check:build-graph` now also asserts the solution names every workspace project, so **a new project needs an entry there too**. It asserts one more thing that is not a build order at all: that every export subpath resolving to `dist/` names the source behind it in a `fallow` condition, which is what keeps the dead-code gate independent of build state (#334, and the rot gates section above).

One deliberate exception, in `pnpm.packageExtensions` at the root: **Nx gets its own private `typescript@6.0.3`**. Nx's project-graph plugins (`@nx/js/typescript` and the built-in `nx/js/dependencies-and-lockfile`) `require('typescript')` and call the classic JS compiler API (`ts.readConfigFile`, `ts.Extension`), which TypeScript 7's package no longer exposes. Handed TS 7 they die with `tsModule.readConfigFile is not a function` and the whole graph fails to build, so nothing runs. This is still true on the latest Nx (23.x), so it is not fixed by upgrading. The extension pins TS 6 *inside* Nx's own `node_modules`, where Node's resolution finds it before walking up to the root, so nothing the workspace compiles ever sees it. Drop the extension only once Nx stops needing the legacy API.

### Database

SQL migrations are the **source of truth**; dbmate applies them, Kysely is the server query builder.

```sh
pnpm db:migrate     # dbmate up   (packages/db/migrations -> packages/db/schema.sql)
pnpm db:rollback
pnpm db:status
```

`packages/db/schema.sql` is checked in and is the dump `db:migrate` writes, which makes it the input to `pnpm generate:table-types`. That writes `packages/db/src/tables.ts`, so **a migration is three commands: write it, `pnpm db:migrate`, `pnpm generate:table-types`**. Miss the second and `check:table-types` says the dump does not name your migration; miss the third and it says the file is not what the dump produces. dbmate shells out to `pg_dump`, which is in the compose Postgres container if it is not on your PATH. ADR 0004 is the rest.

Fast tests are pure (no DB). Postgres-backed integration tests (`*.integration.test.ts`) are **opt-in** and require an explicit test DB. They live in `packages/db/src/tests/integration` and `apps/server/src/tests/integration`, the latter for the ownership and lifecycle reads that decide whether a write happens, which take a plain `Transaction` and no server context. `apps/server` imports the harness from `@simmer-mosquito/db/test-support`, so `packages/db` must be built first.

```sh
# PowerShell. Start the local Postgres, then point the suites at it:
docker compose up -d postgres
$env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/simmer_mosquito'
pnpm --filter @simmer-mosquito/db test
pnpm --filter @simmer-mosquito/server test
```

Never point `TEST_DATABASE_URL` at the Railway staging `DATABASE_URL`. The migration set applies as one transaction creating 326 relations, which overruns the logical decoder's 1 GB reorder buffer and kills the walsender for good. That is how staging's Electric sync died (#166, #236). `withTestDb` reads `pg_replication_slots` and refuses to run when it finds a row, with no flag or variable past it.

If you have ever started the local Electric, that same container carries its `electric_slot_default` and the suites refuse it until you drop the slot with `select pg_drop_replication_slot('electric_slot_default');`. A local Electric recreates it on next boot, so it costs one re-snapshot. The refusal message says this too, and says it only for the container in front of you.

The compose service is also the only local Postgres these suites run on out of the box. Several files build their schemas at once, so the lock table holds every object of all of them and the stock `max_locks_per_transaction=64` fails twelve files at once with `out of shared memory` (SQLSTATE 53200). `docker-compose.yml` raises it to 1024 and creates `postgis`, `pgcrypto`, `pg_trgm` and `btree_gin` in `public` first, so the migrations' `create extension if not exists` is the no-op it expects; a hand-started container needs both.

Each test builds a throwaway `simmer_test_*` schema, applies every migration into it as a single query, and drops it afterwards, so `public` is never touched. That is about a second per test against the container, and `describeDbIntegration` sets its own 45s timeout; do not run these suites under vitest's default. Without `TEST_DATABASE_URL` they **skip silently**, so a green `pnpm test` does not mean they ran.

CI runs them the same way. The `Database integration tests` job starts a `postgis/postgis:17-3.5` service container, the version staging runs, and points `TEST_DATABASE_URL` at loopback, so nothing CI does reaches the database your dev server is talking to.

**Local dev backends:** everything runs on your machine. `apps/server` and the frontends run locally, and Postgres and Electric come from `docker-compose.yml` (`docker compose up -d postgres electric`, with `.env` and `apps/server/.env` on the `.env.example` values and `ELECTRIC_SECRET` unset). **Nothing local points at Railway.** Staging is a sandbox organization staff sign into, so a local dev server writing to it corrupts their test; there is no documented escape hatch back to it. Local data comes from `scripts/clone-prod-db.ps1`, which clones prod into the compose Postgres, prunes to the last 3 years of dated records, and relinks the cloned prod WorkOS ids to the WorkOS **staging** ids local dev signs in against. See `docs/deployment.md`, "Local development" and "Cloning production data". Deploys are gated on `pnpm test` passing (`verify` job), so keep tests green or nothing deploys. Pushing `main` is a production release, and `railway-deploy.yml` is the only way into either Railway environment; nothing on Railway's side watches a branch.

**Staging is a user-facing sandbox, not a scratch environment.** It holds a full-history clone of production and authenticates against WorkOS **production**, so its sign-ins are real identities. `WORKOS_IDENTITY_WRITES_DISABLED=true` is set on the staging server, which refuses every WorkOS identity write with 403 `workos_identity_writes_disabled`: inviting, changing a role, removing access, resetting a password, signing up and creating an Organization all refuse there, while signing in and switching Organization work. Read ADR 0017 before touching anything that calls WorkOS. The five role-ladder test accounts are WorkOS **staging** logins and do not exist there; role testing runs locally.

## Architecture

Authoritative docs (read before non-trivial work):
- `docs/architecture.md`: full system shape.
- `docs/adr/`: accepted architecture decisions (0001 to 0019). Read the relevant ADR before changing auth, sync, identity, domain vocabulary, organization scope, DB layering, field-work provenance, region membership, geometry shape, or the mobile session. **0017 is a standing constraint on identity**: staging authenticates against WorkOS production and performs no WorkOS identity writes. **0013 is accepted and built**: every identity write is a domain command in the `identity.*` namespace, including the four on `/commands/memberships` that also settle WorkOS. `IDENTITY_FLOORS` is gone and every floor is in `COMMAND_PERMISSIONS`. `people.listMemberships` stays REST, because it is a read behind a POST. **0014 amends 0007**: read both for sync, because the package boundary is 0007's and the mechanism is 0014's. **0015 is accepted and built for web**: region membership is computed on read, and area versus area needs interiors to meet, which amends the plain-intersection rule the Region multiselect shipped under. One predicate in `packages/db/src/domains/map-region-filter.ts` serves both the multiselect and `GET /records/:recordType/:recordId/regions`, and the hand-written corpus behind `@simmer-mosquito/mapping/test-corpus` is what holds it. Mobile's TypeScript half is specced and unbuilt, and the corpus is the gate it passes. `docs/region-membership-spec.md` is the rest. **0018 amends 0015 and is built**: a record's geometry may have several parts, promoting to MultiPolygon on the same row and demoting back. The nine CHECKs take all six shapes, `regions.geom` takes a MultiPolygon, `notification_registrations` narrowed to Point and Polygon, and the membership branch reads `st_polygon` or `st_multipolygon`. `OWNED_GEOMETRY_POLICIES` is the single register of which record kind stores which shapes, and a stored geometry must cover ground. The draw control adds and removes parts and cuts holes, and both import surfaces are one row per Feature, gated on the register rather than on one geometry type. Two gaps it left are their own issues: continuing a finished part is #445, and importing a Point is #446, which no import surface has ever done. `docs/multipart-geometry-spec.md` is the rest.
- `CONTEXT.md`: domain glossary (load often). `docs/*-domain.md`: per-domain command vocabulary.
- `docs/sync.md`: the table-level Electric/TanStack DB sync matrix (eager vs on-demand per table).
- `docs/domain-command-contract.md`: command, validation, and offline rules, plus the `/commands/{table}` write surface: which endpoint a new command goes on, the two halves declaring one takes, and the `snake_case`/`camelCase` rule for a body's keys. Read it before adding a command.

### Apps and packages

- `apps/server`: Hono control plane. Owns WorkOS callbacks, session cookies, `AuthContext` resolution, Electric shape authorization, command endpoints, authenticated MVT map tiles, and **all server-authorized Postgres writes**.
- `apps/web`: organization-facing Vite + React + TanStack Router SPA. Online-only in v1.
- `apps/admin`: SIMMER **operator** (platform-side) control plane, not organization administration. Org creation and support, invitations, global taxonomy, global units.
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
- Identity model: `users` (the **Account**, WorkOS-linked), `organizations` (the **Organization**, WorkOS-linked), `profiles` (org-scoped people for attribution; may exist without an Account), `memberships` (current user↔org↔profile↔role↔status). Use the domain vocabulary in `CONTEXT.md`: Organization, Account, Profile, Membership, never agency, tenant, user, or login.
- Organization scope: `organization_id` lives on organization-owned root records; children derive their organization via FKs. Add `organization_id` to child tables only when query, sync, or indexing pressure proves it useful.

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
