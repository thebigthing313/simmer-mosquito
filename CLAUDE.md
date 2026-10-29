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
pnpm check:all      # biome, then every static gate; see "Rot gates"
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

`docs/rot-gates.md` is the reference for every gate: what it checks, why it exists, its floors and probes, and its marker vocabulary. Read a gate's paragraph there before changing the gate or arguing with a failure. The rules to carry while writing code:

- **`pnpm check:all` is the pre-push command.** Biome, then every `check:*` gate; it runs them all and names every failure at the end, in about twenty seconds. `pnpm check` is Biome alone.
- **A new gate is a `check:*` script in the root `package.json` and a `run: pnpm check:*` step in CI's `verify` job.** Both halves: `scripts/check-all.mjs` asserts the two sets match. Then add its paragraph to `docs/rot-gates.md` and a row to the table below.
- **Most gates are at zero with no allowance list.** A gate that holds a backlog (`UNCOVERED_MODULES`, `UNCHECKED_ACKNOWLEDGEMENTS`, `REACT_RULE_BACKLOG`, `BAILING_FILES`) fails when the count moves in either direction, so a branch that clears an entry updates the register.
- **An exemption is a marker on the line above, with one sentence ending in a full stop**, and a marker that exempts nothing fails. The vocabularies are `vocabulary-ignore <word>:`, `copy-dash-ignore:`, `hex-color-ignore:`, `session-credential-ignore:`, `no-memo-reason:`, `manual-memo-reason:` and `<!-- prose-ignore: -->`. Several gates refuse markers in specific places; the reference says where.
- **Floors (`MINIMUM_*`) and `PROBES` guard against a gate that has stopped reading anything**, #591's rule. A floor tripping means the walk or parse broke, not that the code got better.

`fallow` runs three ways. `pnpm check:dead-code` (unused exports, files, unresolved imports, cycles) is at zero and part of `check:all`. `pnpm fallow dupes` ratchets on the threshold in `.fallowrc.jsonc` and `pnpm fallow:health` compares complexity against `.fallow-baseline/health.json`; both read "did this branch make it worse", have their own CI steps, and are not in `check:all`. A health run that fails on stale baseline entries means complexity came out: run `pnpm fallow:baseline` and read the diff. **A new package owes a `fallow` export condition, listed first, on every subpath that points at `dist/`**; `pnpm check:build-graph` fails without it.

| Gate | Holds |
| --- | --- |
| `check:dead-code` | `fallow dead-code` at zero |
| `check:build-graph` | package.json deps and tsconfig `references` name the same edges; the root solution names every project; `fallow` export conditions |
| `check:write-references` | every write naming another record's id goes through the reference gate |
| `check:search-corpus` | `SEARCH_CORPUS` against row schemas, withheld columns and search triggers |
| `check:geometry-policies` | `OWNED_GEOMETRY_POLICIES` is the only geometry-type register (ADR 0018) |
| `check:tileset-keys` | tileset names agree across `MapTilesetLayer`, `MAP_SURFACES`, the tile registry and `TILE_LAYER_BINDINGS`; no `layer:` literal in db domain modules |
| `check:acknowledgements` | acknowledgement vocabulary, payload flags and `ACKNOWLEDGEMENT_MECHANISMS` agree |
| `check:column-vocabularies` | Postgres enums live only in `COLUMN_VOCABULARIES`, in `enumsortorder` order |
| `check:mutation-coverage` | every `use*` mutation hook is named in a mutation suite |
| `check:preview-coverage` | `packages/ui-web` component modules imported by `apps/preview`, ratcheted at `UNCOVERED_MODULES` |
| `check:map-palette` | no colour literal in `apps/web/src`; map colours come from `map-palette.ts` |
| `check:mapping-callers` | every `packages/mapping` barrel module and value name has a caller outside the package |
| `check:color-maths` | colour-maths constants only in `packages/design-tokens/src/color.ts` |
| `check:registered-tokens` | every `:root` role in `ui-web/src/styles.css` is reachable from `@theme inline` |
| `check:image-names` | every `role="img"` carries `aria-label` or `aria-labelledby` |
| `check:record-nouns` | record nouns in `apps/web` come from `RECORD_NOUNS` through `recordNoun`, `recordCount` and `recordType` keys |
| `check:nav-labels` | sidebar and explorer create labels reach the register (`createLabel`, `createPluralLabel`, `listLabel`) |
| `check:join-types` | every query-builder `.join()` passes its join type |
| `check:vocabulary` | copy and identifiers avoid the words `CONTEXT.md` refuses (`agency`, `tenant`, `site`, `seat`, `login`, `user`) |
| `check:prose` | no em dash or spaced en dash in tracked `.md` |
| `check:copy-dashes` | the same dash rule over UI copy |
| `check:table-types` | `packages/db/src/tables.ts` is what the generator emits from `schema.sql` |
| `check:schemas` | sync collection factories are generated output; row schema field lists match `WITHHELD` |
| `check:server-owned-columns` | `SERVER_OWNED` and the client's `serverOwnedColumns` agree |
| `check:write-surfaces` | every write route has a `WRITE_SURFACE_FLOORS` entry and guards itself |
| `check:session-fetcher` | every app importing the sync barrel calls `setSessionFetcher` once |
| `check:session-credentials` | no hand-written `credentials:` literal on a request |
| `check:formatter-locales` | every display formatter passes a literal locale tag |
| `check:unread-declarations` | no `_`-prefixed declaration that nothing reads |
| `check:compiler-bailouts` | React Compiler bail-outs: zero inside `COMPILER_PHASES`, ratchet outside |
| `check:compiler-coverage` | every module holding React is compiled or on `EXEMPT_PATHS` |
| `check:manual-memo` | no `useMemo` or `useCallback` on a compiled path without a `manual-memo-reason` |

`pnpm lint:react` is ESLint with `eslint-plugin-react-hooks` at `flat.recommended`, ratcheted per file by `REACT_RULE_BACKLOG`. It is not a `check:*` gate and has its own CI step; read the messages with `npx eslint` at the root.

Scope a task to one project with Nx or pnpm filters:

```sh
nx test @simmer-mosquito/domain
pnpm --filter @simmer-mosquito/domain test
nx test @simmer-mosquito/domain -- src/tests/unit/foundation.test.ts   # single test file
```

### Where tests live

`docs/testing.md` has the reasons and the exceptions. The rules:

- Suites live in `<project>/src/tests/{unit,integration,e2e}/`, mirroring `src`. Nothing is colocated. `scripts/` keeps its suites at `scripts/src/tests/unit/` and reaches each `.mjs` module through a hand-written `.d.mts` beside it.
- `apps/server/src/tests/unit/table-commands/` and `apps/web/src/tests/unit/hooks/mutations/` are grouped by surface, not by module. A test whose surface already has a suite goes in that suite; find it by reading imports, not file names.
- **A `Link`'s resolved href is asserted in `apps/web/src/tests/unit/link-destinations.test.tsx`**. Add a case there rather than opening a second suite.
- **Preload a route component in `beforeAll` before rendering it** (`Route.options.component.preload()` under a long hook timeout). Code splitting makes it a lazy stand-in that otherwise draws nothing. Do not switch code splitting off under `VITEST`.
- A suite asserting one behaviour across several routes is named for the behaviour and sits in the deepest directory its routes share.
- `vitest.shared.ts` fails a file that holds a worker for eight minutes. It is a tripwire for a hung import; do not tighten it.

### Build toolchain

TypeScript 7 (`typescript@7.0.2`) and `tsc` are the only compiler: `build` is `tsc -b`, `typecheck` is `tsc -p tsconfig.json --noEmit`. Do not add a second compiler path. `docs/build-toolchain.md` has the detail.

- **A cross-package import needs a tsconfig `references` entry as well as a dependency**, and **a new project needs an entry in the root `tsconfig.json`**. Deploys run `tsc -b` alone, so a missing reference passes CI and fails the deploy (#175). `pnpm check:build-graph` holds this.
- **A `tsc` error that survives deleting `dist`, a full build and a reinstall, and that CI does not reproduce, is a stale build info.** Run `pnpm clean:build-info`.
- Nx gets a private `typescript@6.0.3` through `pnpm.packageExtensions` because its graph plugins need the classic compiler API. Leave it until Nx stops needing that.

### Database

SQL migrations are the **source of truth**; dbmate applies them, Kysely is the server query builder. `docs/database.md` is the reference for the dump, `pg_dump` versions, integration suites on Windows and the catalog vacuum.

```sh
pnpm db:migrate     # dbmate up   (packages/db/migrations -> packages/db/schema.sql)
pnpm db:rollback
pnpm db:status
pnpm db:vacuum-catalogs   # vacuum full over the system catalogs when db suites get slow
```

- **A migration is three commands: write it, `pnpm db:migrate`, `pnpm generate:table-types`.** `check:table-types` fails if either of the last two is missed.
- `schema.sql` is written by `pg_dump` 17.0 to 17.5 only. `scripts/db-migrate.mjs` checks the local client and falls back to the compose container's when it is missing or out of range. CI's integration job fails when the dump it writes differs from the checked-in file; fix it with `pnpm db:migrate` or `node scripts/db-migrate.mjs dump`.
- Integration suites (`*.integration.test.ts`) are opt-in and **skip silently without `TEST_DATABASE_URL`**, so a green `pnpm test` says nothing about them. `apps/server`'s need `packages/db` built first.

```sh
# PowerShell. Start the local Postgres, then point the suites at it:
docker compose up -d postgres
$env:TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/simmer_mosquito'
pnpm --filter @simmer-mosquito/db test
pnpm --filter @simmer-mosquito/server test
```

- **On Windows use `127.0.0.1`, never `localhost`**: Docker Desktop's IPv6 proxy hangs and resets connections. The harness and `readServerEnv` refuse `localhost`. A spray of 45s timeouts means the container is starved, so ask what else is running.
- **Never point `TEST_DATABASE_URL` at Railway staging.** The migration set overruns the logical decoder and kills Electric's walsender (#166, #236). `withTestDb` refuses any database with a replication slot, so a local Electric's `electric_slot_default` has to be dropped first.
- **Everything runs locally and nothing local points at Railway.** Postgres and Electric come from `docker-compose.yml`, and local data comes from `scripts/clone-prod-db.ps1` (see `docs/deployment.md`). Deploys are gated on `pnpm test`, pushing `main` is a production release, and `railway-deploy.yml` is the only way into either Railway environment.
- **Staging is a user-facing sandbox** on WorkOS **production** with `WORKOS_IDENTITY_WRITES_DISABLED=true`, so every WorkOS identity write refuses there. The role-ladder test accounts exist only on WorkOS staging, so role testing runs locally. Read ADR 0017 before touching anything that calls WorkOS.

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
- `packages/sync`: framework-agnostic TanStack DB collection factories, per-table row schemas scaffolded from the database (`src/collections/tables`), and the optimistic write path (`src/collections/functions`) that turns a mutation into a named domain command. A row schema is **not** a file to leave alone: `pnpm generate:schemas` decides which columns are in it and a person decides the zod expression beside each one, the order and the prose, and running the generator again adds and removes field lines in place rather than writing the file over. The collection factories, the two barrels and the drift suite beside them are generated whole and are nobody's to edit. `pnpm check:schemas` is what holds both halves to that.
- `packages/mapping`: provider-neutral geometry, GeoJSON, sketch, import and measurement helpers.
- `packages/auth`: WorkOS AuthKit and session helpers. `packages/config`: env parsing. `packages/design-tokens`: framework-free visual tokens. `packages/ui-web`: shared shadcn/Radix/Tailwind component source and the semantic icon registry.

Shared packages avoid React and platform-specific storage unless their name says otherwise.

### Data flow (critical model)

Reads are sync-native. Clients never talk to Postgres or unrestricted Electric directly:
```
Postgres -> ElectricSQL -> TanStack DB -> UI
```
The **server authorizes every sync shape** before Electric streams. Shape proxy routes force the authorized table/columns/scope server-side and ignore caller-provided `table`/`columns`/`where`.

Writes go through domain commands (intent, not DB patches), applied as TanStack DB optimistic mutations, sent to a Hono command endpoint, committed in a Kysely transaction, then confirmed via Electric sync. Commands use client-generated UUIDs and carry domain actor ids and operational dates so they are replay-safe and audit-safe.

The command endpoint is one per table, `POST|PATCH|DELETE /commands/{table}`, and the body's `intents` list names the commands the write means rather than letting the server infer them from which fields arrived. `apps/server/src/table-commands/` is 54 tables and 273 of the 282 names in the vocabulary. The nine that are not on it, the six operator seed creates that are the last of the older per-domain surface, and the rules for adding a command are in `docs/domain-command-contract.md`. The domain writers those commands run live in `apps/server/src/writers/`, which registers no routes.

### Authorization and identity

- Server-side authorization, **not** Postgres RLS. The server resolves `AuthContext` (WorkOS user, SIMMER user, organization, profile, membership, role) from the WorkOS sealed session cookie and authorizes sync shapes and command endpoints.
- Identity model: `users` (the **Account**, WorkOS-linked), `organizations` (the **Organization**, WorkOS-linked), `profiles` (org-scoped people for attribution; may exist without an Account), `memberships` (current user↔org↔profile↔role↔status). Use the domain vocabulary in `CONTEXT.md`: Organization, Account, Profile, Membership, never agency, tenant, user, or login.
- Organization scope: `organization_id` lives on organization-owned root records; children derive their organization via FKs. Add `organization_id` to child tables only when query, sync, or indexing pressure proves it useful.

### Validation boundary

Pure domain builders validate context-free rules (required fields, enums, ranges, date shape, mutually-exclusive fields, normalization). Server command handlers validate context-dependent rules (org ownership, role auth, referenced-row existence, lifecycle, uniqueness and concurrency, geometry source lookup and snapshot).

## Conventions

- **Skills**: before substantial work, check local skills (`pnpm.cmd dlx @tanstack/intent@latest list`) and load the most specific matching one with `... load <package>#<skill>`.
- **Components**: every UI component in `apps/web` and `apps/admin` lives under that app's `src/components`, in a kebab-case file, grouped by the surface it draws (`components/larval-surveillance/habitats/`, `components/my-organization/`, `components/auth/`). `src/routes` holds route modules alone: the TanStack Router hyphen prefix that used to mark a route-private module (`-habitat-form.tsx`, `-components/`) is not used, so a module the router should ignore moves out of `routes/` rather than being renamed inside it. A component's factored-out parts are separate files beside it (a form's values module, a section, a dialog), and a component module stays under about 600 lines. A component's docblock says what it draws and what it takes; the reasons, the measured alternatives and the traps go in `docs/web-components.md`, one heading per component.
- **Hooks**: every React hook in `apps/web`, `apps/admin`, `apps/preview` and `apps/mobile` lives under that app's `src/hooks`, one hook per file, in a kebab-case file named `use-<hook>.ts`; a component, route or form module defines none of its own. `apps/web/src/hooks` groups by surface (`map/`, `explorer/`, `search/`, `operations/`, and so on) beside `queries/` and `mutations/`, which follow the same rule. A hook's docblock says what it does and what it takes; the reasons, the measured alternatives and the traps go in `docs/web-hooks.md`, one heading per hook.
- **TanStack Router**: file-based routing. Keep generated `src/routeTree.gen.ts` committed and never hand-edit it. Configure the Vite router plugin with `autoCodeSplitting: true`.
- **UI and styling**: compose `packages/ui-web` shadcn primitives before writing custom JSX; promote reused patterns into `ui-web` as `cva` variants. Style with Tailwind semantic tokens and shadcn variants, and keep route-level `className` to layout. Import icons from `@simmer-mosquito/ui-web/icons/registry`, not `lucide-react` directly. Keep durable raw values in `packages/design-tokens`. App CSS is reserved for globals, token exposure, vendor and browser selectors, and cases Tailwind can't express. See `AGENTS.md` and `DESIGN.md` for the full rules.
- **Formatting and lint**: Biome (`pnpm check`). Tabs (width 2), LF, single quotes, semicolons, trailing commas, 100-col. Generated files (`routeTree.gen.ts`, `packages/ui-web/src/components/ui`, `dist`) are excluded.
  **`check` gates at zero diagnostics, warnings included** (`--error-on-warnings`), and `noUnusedImports` and `noUnusedVariables` are `error` in `biome.json` on top of that. Warnings used to pass the job by severity, and 46 of them accumulated, about 20 being dead imports nothing counted: `fallow dead-code` gates unused *exports*, so an unused *import* fell between the two gates and sat there (#543). The tree is at zero with no allowance list, so a new warning fails the branch that wrote it. If a Biome upgrade adds a recommended rule, fix what it finds or set that rule's severity deliberately; do not put the tolerance back.
  **Biome is not the only linter any more, and its `react` domain is off deliberately.** ESLint owns the React rules and nothing else, through `pnpm lint:react`; the boundary and the reason for it are in the docblock of `tools/eslint-config/eslint.config.js`. A Biome release that enables a React rule is therefore a rule to switch back off, not a finding to fix, because two linters holding an opinion about one hook is how a line ends up needing both a `biome-ignore` and an `eslint-disable`.
- **Display formatters pin `en-US`.** Every `Intl.DateTimeFormat`, `Intl.NumberFormat`, `toLocaleString`, `toLocaleDateString` and `toLocaleTimeString` in `apps/web/src`, `apps/admin/src` and `packages/ui-web/src` outside `components/ui` passes `'en-US'` rather than `undefined`, `'default'` or nothing, so the output is the same on every machine and a suite may assert the wording. The scope is every hand-written module that draws for the two apps, which is what #1116 widened it to and what `pnpm check:formatter-locales` reads since #1128: the sweep in #683 stopped at `apps/web/src`, and the shell header's date line, the error report's `Time` row and the admin organization page's dates were each inheriting the browser's locale behind it. The generated shadcn components under `packages/ui-web/src/components/ui` are out, and four of them format unpinned today, because they are regenerated from the registry and a hand edit there is one the next regeneration reverts. Nothing in the product offers a locale switch, so an unpinned formatter was not serving a preference, it was inheriting whatever the runtime happened to be, and it was one CI locale away from failing (#683). The exception is a tag picked for its **format shape** rather than for a reader: `todayInTimeZone` pins `en-CA` for year-month-day and `localTimeOfDay` pins `en-GB` for a bare `HH:MM`, both in `apps/web/src/lib/local-date.ts`, and each says so in a comment. A formatter doing that owes the comment. This is about wording and separators only; **which day a record belongs to is still the Organization's**, so a formatter over an operational date takes the `timeZone` as it always did (#154, #156).
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
