# Does the React Compiler pass run under vitest

Status: research for [#776](https://github.com/thebigthing313/simmer-mosquito/issues/776).

Everything below was measured on this checkout, by wiring the real compiler into
`apps/web` and running the real suite. Nothing here is read off a doc. The
working tree was restored afterwards and is clean.

## The answer

**Yes, for every jsdom suite in `apps/web` and `apps/admin`. No for every node
suite, and no for `packages/ui-web` in any suite.**

[#650](https://github.com/thebigthing313/simmer-mosquito/issues/650) says suites
"only reach the Babel pass in a build or dev server, not under vitest". That is
wrong, and its reasoning contains the refutation: the compiler is a Vite plugin
and vitest reads a config that carries it, which is the argument for the pass
running, not against it.

## The mechanism, in four parts

**Vitest resolves three Vite environments.** A probe plugin logging
`configResolved` on `apps/web` under vitest 4.1.5 and vite 8.0.10:

```
envs= [ 'ssr', '__vitest__', 'client' ]
  env ssr        consumer= server
  env __vitest__ consumer= server
  env client     consumer= client
```

**A test file picks which one transforms it, through its test environment.** A
node-environment suite is transformed in `ssr`; a suite with
`/** @vitest-environment jsdom */` is transformed in `client`, and so is
everything it imports. Both were observed directly:
`src/tests/unit/lib/format-count.test.ts` transformed in `ssr`,
`src/tests/unit/components/custom-fields-card.test.tsx` in `client`, along with
every `packages/ui-web` source it pulled in.

**The preset gates on the consumer.** `reactCompilerPreset` in the installed
`@vitejs/plugin-react@6.0.1` (`dist/index.js:48`):

```js
applyToEnvironmentHook: (env) => env.config.consumer === "client",
```

**The plugin turns that gate into on or off per environment.** In the published
`@rolldown/plugin-babel@0.2.4`, `applyToEnvironment` runs
`filterPresetsWithEnvironment`, and returns `false` when no preset survives, so
in `ssr` and `__vitest__` the plugin is not merely idle, it does not apply at
all. In `client` it applies and transforms.

## Which projects carry the plugin at all

`apps/web/vitest.config.ts` and `apps/admin/vitest.config.ts` are
`mergeConfig(viteConfig, shared)`, so the whole plugin array is in effect under
vitest. `packages/ui-web/vitest.config.ts` re-exports `vitest.shared.js` and
nothing else, so it has no plugins and would never run a compiler pass whatever
`packages/ui-web` did. `apps/preview` has no `vitest.config.ts` and no suites.

How much of each project is jsdom, and therefore in scope:

| Project | Suites | Declaring jsdom |
| --- | --- | --- |
| `apps/web` | 168 | 74 |
| `apps/admin` | 11 | 8 |
| `packages/ui-web` | 15 | 1 |
| `apps/preview` | 0 | 0 |

Every one of the 74 is a per-file docblock. No config sets an environment.

## What actually compiles in a full run

Measured with `babel({ presets: [reactCompilerPreset()] })` in
`apps/web/vite.config.ts`, `infer` mode, no path filter, plus a probe plugin
ordered after it that counts modules whose transformed code names
`react/compiler-runtime`.

Modules reaching a transform in one full `apps/web` run: **1026 in `client`,
720 in `ssr`**. The `client` figure includes 81 test modules, 187 route modules,
415 other `apps/web/src` modules, 125 `packages/ui-web` sources and 216 modules
from other workspace packages.

Modules the compiler actually rewrote: **383**.

| Area | Modules rewritten |
| --- | --- |
| `apps/web/src/hooks` | 137 |
| `packages/ui-web/src` | 99 |
| `apps/web/src/components` | 79 |
| `apps/web/src/routes` | 34 |
| `apps/web/src/components/map` | 25 |
| `apps/web/src/tests` | 6 |
| other `apps/web/src` | 3 |

The 25 map modules include `use-map-draw.ts`, `use-draw-location.ts` and
`geometry-control.tsx`, which is the hazard area
[#653](https://github.com/thebigthing313/simmer-mosquito/issues/653) named. Six
test modules compile because they define components or hooks inline:

```
src/tests/unit/components/catalog/catalog.test.tsx
src/tests/unit/components/explorer/explorer-map-page.test.tsx
src/tests/unit/components/key-entry/key-entry-dialog.test.tsx
src/tests/unit/components/map/map-canvas.lifecycle.test.tsx
src/tests/unit/components/map/use-map-draw.test.tsx
src/tests/unit/hooks/use-debounced-value.test.tsx
```

## Does any suite behave differently

**No. 168 of 168 files and 1898 of 1898 tests pass with the compiler on**, at
`infer`, unscoped, over the whole app and every `packages/ui-web` source those
suites reach. Two runs, identical results. The map suites pass, including the
1100-line `use-map-draw.test.tsx` over a module the compiler rewrites.

That is a weaker result than it looks, and it should be read as such. It says
the suites do not break. It does not say the compiled map modules are correct:
#653's top hazard is that six ref-holding map modules compile clean and would be
memoized silently, and a green suite is exactly what that hazard predicts.

## The cost

Full `apps/web` suite, this machine, `pnpm exec vitest run`:

| Run | Wall | Cumulative transform |
| --- | --- | --- |
| baseline | 66.9s | 52.5s |
| baseline | 64.6s | 58.7s |
| compiler on | 74.4s | 145.9s |
| compiler on | 73.4s | 138.1s |

About **8s of wall clock, 12%**. Cumulative transform time across workers is the
number that moves hard, roughly 2.5x, and most of it hides behind parallelism.
One machine, so treat the percentage as the shape rather than as CI's number.

## Assertions the compiler could change

**Snapshots: there are none.** No `toMatchSnapshot`, no
`toMatchInlineSnapshot`, no `__snapshots__` directory anywhere in `apps/web`,
`apps/admin` or `packages/ui-web`. The only snapshot user in the workspace is
`packages/db/src/tests/unit/domains/map-surface-sql.test.ts`, over SQL text.
#776 names "the snapshot suites under `components/catalog`" as worth checking:
`catalog.test.tsx` exists and uses no snapshots.

**Render counts: one assertion.**
`src/tests/unit/components/map/use-map-measure.test.tsx:301`,
`expect(renders()).toBe(before)`, asserting that a cursor move does not re-render
the map. It passes with the compiler on. It is the only render-count assertion
in the three projects.

**Reference identity: nothing that holds a memoized value.** The `toBe` identity
assertions are over DOM nodes and fake-map objects, not over values a `useMemo`
produces:

```
components/explorer/explorer-map-page.test.tsx:313  a DOM node survives a collapse
components/map/map-canvas.lifecycle.test.tsx:333    a new GL instance after a hide
components/map/use-tile-layer.test.tsx:63,120       a Mapbox source spec is not re-added
lib/collections/registry.test.ts:53,75              a registry cache, no React in it
```

Every `expect(result.current.x).toBe(...)` in the `renderHook` suites compares a
boolean, a number or a string.

**`packages/ui-web/src/tests/unit/styles.contrast.test.ts` is unaffected in both
directions.** It imports no React, reads two stylesheets through
`scripts/lib/stylesheet-tokens.mjs`, and runs in a project whose vitest config
carries no plugins.

## What this means downstream

**The ui-web seam is real and unavoidable.** A `packages/ui-web` component is
compiled when an `apps/web` or `apps/admin` jsdom suite renders it, and
uncompiled when `packages/ui-web`'s own `app-form.test.tsx` renders it. Giving
that project a vite config to close the seam would be a new config for one
suite. Leaving it open costs one component's coverage running twice under two
compilations, which is the same split
[#655](https://github.com/thebigthing313/simmer-mosquito/issues/655) already
accepted for the three consuming apps.

**Each phase gets a partial behavioural check for free.** A phase filter names a
path, and the filter is by id rather than by environment, so the modules a phase
turns on are compiled under vitest too, and whatever jsdom suites cover them
exercise the compiled code. It is partial: 94 of `apps/web`'s 168 suites are
node-environment and give nothing.

**The suites test what ships, and that is the argument for leaving it on.**
Excluding `src/tests` from the preset filter would buy back part of the 12% and
would make every jsdom suite render uncompiled components while the browser gets
compiled ones. That is a seam introduced on purpose, in the phase where the
whole point is to find out what the compiler changes.

**One flag for [#777](https://github.com/thebigthing313/simmer-mosquito/issues/777).**
The bail-out logger is an option on the same preset, and the pass runs in the
`client` environment under vitest, so a `pnpm test` run will emit logger events
too. Not separately measured, it follows from the pass running. A gate that
counts events needs to know which command produced them.

## Recommended answer for #657

`pnpm test` is expected to pass unchanged, and to run the compiler over the
phase's modules in whatever jsdom suites reach them. For phase 1 that is
`apps/admin`'s 8 jsdom suites over its own `src`. Verify by reading the
transformed code, not by the run being green: a probe plugin ordered after
`babel()` that looks for `react/compiler-runtime` in the transform output is
what proved it here, and it took one file.
