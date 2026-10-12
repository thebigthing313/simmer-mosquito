# Testing

Where suites live, how they are grouped, and the traps in rendering routes under vitest. Database-backed suites are in `docs/database.md`.

## Where tests live

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

**A `Link`'s destination is asserted in one file:
`apps/web/src/tests/unit/link-destinations.test.tsx`.** `tsc` checks every `to`
and `params` pair against the generated route tree, so a path that does not exist
fails the build, but nothing checked which id went into it and three merged
branches shipped an untested destination (#582). `router-harness.tsx` beside it
renders a component with a real router over `routeTree.gen.ts` in context and no
route mounted, so a `Link` resolves a real href without a loader having to be
satisfiable. Importing that tree pulls in every route module and costs about 13
seconds, and vitest isolates modules per file, so **a new link case goes in the
existing file** rather than opening a second suite that pays it again. A case
asserting only the `to` prop is not worth writing; assert the href. Since #1147
a route suite mounted under `routerStandIn` can assert one too, because the
stand-in's `Link` is an anchor whose `href` is the `to` template with each
`$param` replaced by the param of that name, and a param the suite does not
pass leaves its segment as written, so a missing id reads as `$id` rather than
as an empty segment. That is the split: template plus id in the route suite,
resolution in `link-destinations`. A substituted href is not proof the route
exists: `tsc` holds `to` to the tree and `link-destinations` holds the
resolution. The stand-in serialises no `search` either, so anything about
search, index routes, trailing slashes or whether the path resolves goes there.

**A route component has to be preloaded before a suite can render it.**
`apps/web/vite.config.ts` runs the TanStack Router plugin with
`autoCodeSplitting: true` and `vitest.config.ts` merges that config, so a suite
gets the split build the app ships. Splitting rewrites a route's
`component` option into a lazy stand-in, so `Route.options.component` is that
stand-in and not the component: rendering it suspends until the module arrives,
and under vite-node that first import pulls the route's whole dependency tree,
forms and Mapbox included, which is seconds rather than milliseconds. It
overruns vitest's five-second default `testTimeout`, and the failure never says
so, because what a case sees is a component that drew nothing: a suite over
fourteen routes reports fourteen routes with no submit control rather than one
import that did not finish. So call the stand-in's `preload()` in `beforeAll`
under a hook timeout that fits, and let every case render a component already in
hand. `apps/web/src/tests/unit/routes/write-attribution.test.tsx` is the file
that does it, fourteen routes under a 300 second `beforeAll`, and its docblock
carries the same explanation. **Do not switch code splitting off under
`VITEST`.** #908 tried that in `vite.config.ts` and backed it out: no config
change is needed once the components are preloaded, and a suite running on an
unsplit build stops exercising the build the app ships.

**A suite that asserts one behaviour across several route modules is named for
the behaviour, and sits where its routes meet.** No one module is what it
covers, so it takes the name of what it asserts, and it lives in the deepest
directory under `apps/web/src/tests/unit/routes` that every route it renders
shares: a suite over two Operations routes goes in `routes/operations/`, and one
over routes in several domains goes at `routes/`. `write-attribution.test.tsx`
is the example, one file at `routes/` asserting that fourteen routes gate their
submit on the same predicate. Such a suite stays one file. What it proves is that
the routes agree, which a file per route cannot say, and every route it renders
is preloaded first, which costs seconds per file, so one file pays that once.

**`scripts/` is a project too, and it has no `src` tree to mirror.** The static
gates and the modules they share are `.mjs` at `scripts/` and `scripts/lib/`,
and converting them to TypeScript is not on the table, so the vitest project
there keeps its suites at `scripts/src/tests/unit/` mirroring the directory the
module sits in: `scripts/lib/masked-source.mjs` is covered by
`scripts/src/tests/unit/lib/masked-source.test.ts`, and a second suite over
another module in `lib/` is a second file beside it. The project compiles
`src/**/*.ts` the way every other one does, so the suite is typechecked, and it
reaches the module it covers through a hand-written `.d.mts` next to that
module, which is how `packages/ui-web`'s contrast guard has read
`stylesheet-tokens.mjs` since it shipped. A declaration file emits nothing and
sits outside `rootDir` without complaint, which is the whole reason that shape
works. The `test` script is `vitest run src` with no `--passWithNoTests`, unlike
every other project: this one exists for its suites, so a run that collects
nothing is a failure rather than a pass (#665).

## A hanging test file is bounded, loosely

`vitest.shared.ts` carries a watchdog that fails a run when one file holds a
worker for eight minutes without reporting, and the failure names the file. It is
there because **none of vitest's timeouts bounds an import**: `testTimeout`
bounds a test callback, `hookTimeout` a hook, `teardownTimeout` the wait for
shutdown, and a module that awaits a promise which never settles hangs before
any of the three exists. Before #663 such a file ran until CI killed the job and
the report named nothing.

The number is a tripwire, not a performance gate. #545 took a 60s budget off
`import-side-effects.test.ts` because it was measuring machine load, and a bound
a slow suite can trip is worse than no bound, because the next person deletes
it. **Do not tighten it because a suite got slow.** The comment beside the
constant says the same thing.
