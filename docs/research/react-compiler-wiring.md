# React Compiler wiring for Vite 8 and plugin-react 6

Status: research for [#650](https://github.com/thebigthing313/simmer-mosquito/issues/650).
Nothing here is built. No build was run and no file in the repo was changed.

Every claim below is read off one of four primary sources: the installed
`@vitejs/plugin-react@6.0.1` under `node_modules/.pnpm`, the installed
`babel-plugin-react-compiler@1.0.0` under the same, the published
`@rolldown/plugin-babel@0.2.4` tarball from the npm registry, and the pages under
`react.dev/reference/react-compiler`. Where a doc and the code disagree, the code
wins and I say so.

## What is actually installed

Verified against `apps/*/package.json` and `pnpm-lock.yaml`.

| Package | Declared | Resolved | Where |
| --- | --- | --- | --- |
| `vite` | `^8.0.10` | 8.0.10 | devDeps of web, admin, preview |
| `rolldown` | not declared | 1.0.0-rc.17 | transitive under vite (`pnpm-lock.yaml:5637`) |
| `react` | `^19.2.6` | 19.2.6 | deps of web, admin, preview |
| `@vitejs/plugin-react` | `^6.0.1` | 6.0.1 | devDeps of all three |
| `@tanstack/router-plugin` | `1.168.6` (pinned) | 1.168.6 | devDeps of all three |

The context I was handed is correct on all five. Two things it does not say:

- `babel-plugin-react-compiler@1.0.0` is **already in the store**, because
  `babel-preset-expo@57.0.9` under `apps/mobile` depends on it. pnpm has even
  wired it into the plugin-react peer key already:
  `@vitejs/plugin-react@6.0.1(babel-plugin-react-compiler@1.0.0)(vite@8.0.10...)`
  appears three times in `pnpm-lock.yaml` (lines 122, 229, 341), once per app.
  That is peer resolution, not a usable import: nothing is symlinked into
  `apps/web/node_modules`, so the app cannot resolve it today.
- `@babel/core@7.29.0` is likewise in the store via expo, and likewise not
  reachable from the three web apps.

`@vitejs/plugin-react` latest on npm is **6.1.1**, not 6.0.1. The peer range for
`@rolldown/plugin-babel` is identical in both (`^0.1.7 || ^0.2.0`); 6.1.1 adds one
new optional peer, `oxc-transform-react@^0.145.0`. Nothing in this note changes
between the two versions.

## The exact plugin array

`reactCompilerPreset` is not a Vite plugin. It is a value you hand to
`@rolldown/plugin-babel`'s `presets` array. Read the source
(`node_modules/.pnpm/@vitejs+plugin-react@6.0.1__.../node_modules/@vitejs/plugin-react/dist/index.js:44`):

```js
const reactCompilerPreset = (options = {}) => ({
	preset: () => ({ plugins: [["babel-plugin-react-compiler", options]] }),
	rolldown: {
		filter: { code: options.compilationMode === "annotation" ? /['"]use memo['"]/ : /\b[A-Z]|\buse/ },
		applyToEnvironmentHook: (env) => env.config.consumer === "client",
		optimizeDeps: { include: options.target === "17" || options.target === "18" ? ["react-compiler-runtime"] : ["react/compiler-runtime"] }
	}
});
```

So it does three things beyond naming the Babel plugin: it pre-filters files by a
regex over their **source text**, it restricts itself to client environments, and
it pre-bundles the runtime module.

The array, which is what both the plugin's own README and
[react.dev's installation page](https://react.dev/learn/react-compiler/installation)
print:

```js
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

plugins: [
	TanStackRouterVite({ autoCodeSplitting: true }),
	react(),
	babel({ presets: [reactCompilerPreset()] }),
	tailwindcss(),
]
```

### Does ordering against `react()` matter

Not for the reason people assume, and the mechanism is worth stating exactly.

`@vitejs/plugin-react` 6 has **no `transform` hook at all**. Its four plugins are
`vite:react-babel` (`enforce: 'pre'`, `config()` only), `vite:react:refresh-wrapper`,
`vite:react:config-post` and `vite:react-refresh`. The name `vite:react-babel` is
a leftover: all it does is write `oxc.jsx` config for Vite's own transform. Grep
`dist/index.js` for `transform:` and the only hit is inside an `optimizeDeps`
object. So there is nothing for the Babel pass to run before or after.

`@rolldown/plugin-babel` is itself `enforce: 'pre'`, with the comment "this plugin
should run before TS, JSX, TSX transformations are done"
(`packages/babel/src/index.ts` on `rolldown/plugins@main`, and `enforce: "pre"`
is in the published `0.2.4` `dist/index.mjs`). That is what puts it ahead of
Vite's oxc transform, and it is why it does not need to be adjacent to `react()`.

**Ordering against the router plugin does matter.** The code splitter
(`@tanstack/router-plugin/dist/esm/core/router-code-splitter-plugin.js`) registers
three `enforce: 'pre'` transforms, one of them filtered on `id: /tsr-split/`,
which is the virtual module `autoCodeSplitting` produces. Within the `pre` bucket
Vite keeps array order, so `babel()` placed after the router plugin sees the
post-split code. Placed before it, the compiler would run over the pre-split route
file and the split component would go out uncompiled. The split ids look like
`<file>.tsx?tsr-split=...`, and the Babel plugin's default include regex is
`/\.(?:[jt]sx?|[cm][jt]s)(?:$|\?)/`, which admits a query string, so those virtual
modules are in scope.

The router plugin has a guard for this and it will **not** catch a misplaced
`babel()`. `TRANSFORMATION_PLUGINS_BY_FRAMEWORK` (same file, line 20) throws a
"Plugin order error" only when a plugin named `vite:react-babel`, `vite:react-refresh`,
`vite:react-swc`, `vite:react-oxc:config` or `solid` sits before the router plugin.
`@rolldown/plugin-babel` is not on that list. Get the order wrong and you get a
silently uncompiled route tree, not an error.

## Which packages, which versions, which package.json

Three packages, into the `devDependencies` of each app that needs the compiler.
Not the root: pnpm workspaces do not hoist a root devDependency into an app's
`node_modules`, so `import babel from '@rolldown/plugin-babel'` in
`apps/web/vite.config.ts` resolves only if the app declares it.

```
@rolldown/plugin-babel   ^0.2.4
babel-plugin-react-compiler  ^1.0.0
@babel/core              ^7.29.0
```

Why each:

- **`@rolldown/plugin-babel`**. Optional peer of `@vitejs/plugin-react` 6.0.1 at
  `^0.1.7 || ^0.2.0`; `0.2.4` is the current `latest` on npm and satisfies it.
  Optional peer means pnpm will not fetch it for you.
- **`babel-plugin-react-compiler`**. The other optional peer, `^1.0.0`. Named as a
  bare string inside the preset (`plugins: [["babel-plugin-react-compiler", options]]`),
  which Babel resolves relative to the file it is transforming, so it has to be
  resolvable from the app.
- **`@babel/core`**. A **non-optional** peer of `@rolldown/plugin-babel@0.2.4`:
  `"@babel/core": "^7.29.0 || ^8.0.0-rc.1"`, and `peerDependenciesMeta` marks only
  `vite`, `@babel/runtime` and `@babel/plugin-transform-runtime` optional. The
  published `dist/index.mjs` really imports it at runtime (`import * as babel from "@babel/core"`).
  The workspace has `7.29.0` in the store already, but only under expo's subtree.

Two peers you can ignore. `rolldown` and `vite` are peers of the Babel plugin but
appear in the dist only as erased type imports; the published `index.mjs` imports
exactly `./rolldown-runtime-*.mjs`, `picomatch` and `@babel/core`. Nothing needs
`rolldown` declared.

`.npmrc` at the root sets `auto-install-peers=true` and `strict-peer-dependencies=false`,
so an undeclared `@babel/core` would probably get auto-installed and probably work.
Declare it anyway. An auto-installed peer is a version nothing in the repo names,
and this workspace already gates the build graph on declared edges.

`@types/babel__core` is worth a mention and is not needed here. The Babel plugin's
`babelCompat.ts` says to install it "when using babel 7", but nothing in the vite
config touches Babel's types: `reactCompilerPreset` returns a `RolldownBabelPreset`,
and `@vitejs/plugin-react`'s `types/optionalTypes.d.ts` wraps every one of those
imports in `@ts-ignore` precisely because the peers are optional.

Which apps: `apps/web` and `apps/admin` are product surfaces and are where this
pays. `apps/preview` is 12 modules of design-system gallery; adding a Babel pass
there buys nothing measurable. I would leave it out and say so in the PR rather
than add it for symmetry.

## compilationMode

Four values. The union is in the installed types
(`babel-plugin-react-compiler/dist/index.d.ts:1572`):

```ts
declare const CompilationModeSchema: z.ZodEnum<{
    syntax: "syntax";
    infer: "infer";
    annotation: "annotation";
    all: "all";
}>;
```

The behaviour is one switch, `getReactFunctionType` in `dist/index.js:107452`:

- **`infer`** (default, `defaultOptions` at `dist/index.js:108040`). Compiles a
  function that Flow component/hook syntax names as one, else whatever
  `getComponentOrHookLike` recognises: PascalCase or `use`-prefixed names that
  create JSX or call hooks.
- **`annotation`**. `case "annotation": return null`. The switch compiles nothing.
  The only functions that get through are the ones caught **before** the switch,
  by the `tryFindDirectiveEnablingMemoization` check on `fn.node.body.directives`.
  So yes: in `annotation` mode only a function carrying the directive compiles.
- **`syntax`**. Flow `component`/`hook` syntax only. Useless in a TypeScript repo,
  and react.dev calls it "incompatible with TypeScript".
- **`all`**. Every top-level function, falling back to the type `"Other"`. react.dev
  says "not recommended".

### The directive string

`"use memo"`, and `"use forget"` is an accepted alias. From `dist/index.js:106839`:

```js
var OPT_IN_DIRECTIVES = /* @__PURE__ */ new Set(["use forget", "use memo"]);
var OPT_OUT_DIRECTIVES = /* @__PURE__ */ new Set(["use no forget", "use no memo"]);
var DYNAMIC_GATING_DIRECTIVE = new RegExp("^use memo if\\(([^\\)]*)\\)$");
```

**Opt-in is function-body only.** `getReactFunctionType` reads
`fn.node.body.directives`, guarded by `fn.node.body.type === "BlockStatement"`.
Nothing reads program-level directives for opt-in. A file that opens with
`"use memo"` at module scope compiles nothing. react.dev's
[compilationMode page](https://react.dev/reference/react-compiler/compilationMode)
agrees: the directive "must be placed as a string statement at the beginning of
the function body".

That also means an arrow-function component written as a concise body,
`const Foo = () => <div />`, cannot carry the directive at all, because there is
no block to put it in. In `annotation` mode such a component is simply never
compiled. Worth knowing before choosing the mode: `apps/web` writes plenty of
those.

`reactCompilerPreset`'s own filter agrees with the mode. Under `annotation` it
tests the raw file text for `/['"]use memo['"]/`, so a file with no directive
anywhere never reaches Babel at all.

## target, and react-compiler-runtime

`target: '19'` is the default, so **write nothing**. From `defaultOptions`
(`dist/index.js:108055`): `target: "19"`. The schema admits `'17' | '18' | '19'`
plus a `donotuse_meta_internal` object (`dist/index.d.ts:1567`).

The runtime is built into React 19 and no package is needed. Two proofs:

- `getReactCompilerRuntimeModule` (`dist/index.js:107723`) returns
  `"react/compiler-runtime"` for target `"19"` and `"react-compiler-runtime"` only
  for `"17"` and `"18"`.
- `react@19.2.6` ships that subpath. Its `package.json` `exports` names
  `"./compiler-runtime"`, and `node_modules/.pnpm/react@19.2.6/node_modules/react/compiler-runtime.js`
  exists on disk in this checkout.

[react.dev's target page](https://react.dev/reference/react-compiler/target) says
the same, and adds that on 17 or 18 the runtime package belongs in `dependencies`
rather than `devDependencies`. Not our case.

One knock-on: `reactCompilerPreset` sets
`optimizeDeps.include: ['react/compiler-runtime']` on the default target. That is
a new prebundle entry for the dev server, harmless, and it is the reason the
preset exists rather than just `plugins: ['babel-plugin-react-compiler']`.

## The opt-out directive

`"use no memo"`, alias `"use no forget"`, and unlike the opt-in it works in **both**
places.

- Function body: read through `getReactFunctionType`'s sibling path,
  `findDirectiveDisablingMemoization` at `dist/index.js:107219`.
- File top: `dist/index.js:107097` builds the `ProgramContext` with
  `hasModuleScopeOptOut: findDirectiveDisablingMemoization(program.node.directives, pass.opts) != null`.
  That is `program.node.directives`, the module-level directive prologue.

[react.dev's use-no-memo page](https://react.dev/reference/react-compiler/directives/use-no-memo)
adds two rules the source does not state: the directive must sit before any
imports or other code (comments are fine), it must use quotes rather than
backticks, and a function-level opt-out overrides a module-level one.

`customOptOutDirectives` is a `PluginOptions` field if you ever want a project
word instead. Do not use it. A second vocabulary for the same fact is the shape
this repo keeps writing gates to prevent.

There are 0 occurrences of `use memo` or `use no memo` anywhere under
`apps/web/src` today.

## TypeScript and JSX, and what needs excluding

The pass reads TS and TSX as this repo writes them, and it does not need
`@babel/preset-typescript`. `@rolldown/plugin-babel`'s transform handler installs
parser overrides by extension before calling `loadOptionsAsync`
(`packages/babel/src/index.ts`, and the same strings are in the published
`0.2.4` dist):

```js
overrides: [
	{ test: /\.jsx(?:$|\?)/, parserOpts: { plugins: ['jsx'] } },
	{ test: /\.ts(?:$|\?)/,  parserOpts: { plugins: ['typescript'] } },
	{ test: /\.tsx(?:$|\?)/, parserOpts: { plugins: ['typescript', 'jsx'] } },
	...(babelOptions.overrides ?? []),
]
```

It parses the types, it does not strip them; Vite's oxc transform still does that
afterwards. The `(?:$|\?)` on each test is what keeps the router's
`?tsr-split=` virtual modules matching.

The plugin also does not read `babel.config.*` or `.babelrc`: the handler passes
`babelrc: false, configFile: false`. Everything is the options object.

### node_modules

Already excluded, no config needed. The default exclude in
`packages/babel/src/options.ts` is `/[/\\]node_modules[/\\]|^\0rolldown\/runtime\.js$/`,
and that literal is in the published dist.

### Workspace packages are not excluded, and that is the finding

Every shared package here exports **source**, not `dist`. `packages/ui-web`'s
`exports` map points `./components/*` at `./src/components/*.tsx`; the same is true
of `sync`, `mapping`, `domain`, `design-tokens` and `auth`. pnpm symlinks them, and
Vite resolves symlinks to real paths, so `apps/web` compiles
`F:/simmer-mosquito/packages/ui-web/src/components/ui/table.tsx` directly. That path
contains no `node_modules` segment, so the default exclude does not touch it.

Source module counts, tests excluded:

| Package | Modules |
| --- | --- |
| `packages/ui-web` | 148 |
| `packages/sync` | 127 |
| `packages/domain` | 78 |
| `packages/mapping` | 8 |
| `packages/design-tokens` | 5 |
| `packages/auth` | 3 |

Compiling `ui-web` is probably what you want: those are the components
`apps/web` renders. Compiling `sync` and `domain` is 205 modules of framework-free
logic that will mostly fail the preset's `/\b[A-Z]|\buse/` code filter anyway, but
"mostly" is doing work there, because that regex matches any capital letter. Any
module with a type name in it passes.

### Test files

Not excluded by anything. Suites live under `<project>/src/tests/`, which is
inside the app root and matches `*.tsx`. They only reach the Babel pass in a build
or dev server, not under vitest, since the compiler plugin is a Vite plugin and
vitest here reads the same config file. That is a real cost: `apps/web` has 875
`.ts`/`.tsx` modules and 171 of them are under `src/tests/`.

### routeTree.gen.ts

2,915 lines, generated, no components in it. It passes the `infer` code filter
trivially (it is full of capital letters). Excluding it costs one line and buys a
2,915-line Babel parse per build.

An exclusion, if you want one, goes on the preset rather than the plugin. The
plugin-react README documents mutating the preset in place:

```js
const preset = reactCompilerPreset();
preset.rolldown.filter.id = { exclude: [/routeTree\.gen\.ts$/, /[\\/]src[\\/]tests[\\/]/] };
babel({ presets: [preset] });
```

I would ship without it first and measure. Two of the three exclusions above are
guesses about where the time goes, and this repo's own rot-gate notes are full of
counts that turned out different from the guess.

## What it costs

I did not measure. Running a build writes `dist` into a shared checkout, and the
brief said not to change files. So this is the mechanism plus the file counts, not
a number.

The pipeline today has **no Babel at all**. `@vitejs/plugin-react` 6 pulls no
Babel: its `dependencies` are exactly `{"@rolldown/pluginutils": "1.0.0-rc.7"}`,
and the JSX transform is Vite's native oxc. Adding the compiler adds a full
`@babel/core` parse, traverse and print per matching module, in JavaScript, on top
of the oxc transform that still runs afterwards. It is not a marginal cost on an
existing Babel pass; it is a second compiler.

How many modules that is, measured on `apps/web/src`:

| Filter | Modules |
| --- | --- |
| All `.ts`/`.tsx` | 875 |
| Excluding `src/tests/` | 704 |
| Matching the `infer` code filter `/\b[A-Z]\|\buse/` | 873 |
| Matching the `annotation` code filter `/['"]use memo['"]/` | 0 |

The preset's code filter buys almost nothing in `infer` mode. 873 of 875 modules
pass it, because `\b[A-Z]` matches any capitalised identifier and every module in
this app has one. Plus roughly 369 workspace source modules reachable through the
source-exporting `exports` maps. `apps/admin` is 53 modules and `apps/preview` 12.

Two other cost items:

- `sourceMap` defaults to `true` in `@rolldown/plugin-babel`
  (`options.sourceMap ?? true`, in the published dist). Babel generates a source
  map for every module it touches, and that is on top of the map Vite already
  makes. The README names disabling it as the performance lever.
- Dev server too, not just build. The plugin has no `apply: 'build'`; it runs on
  every transform in the client environment, so first paint after a cold start and
  every HMR update on a compiled module pay the Babel parse. `applyToEnvironmentHook`
  restricts it to `consumer === 'client'`, which is every environment these three
  SPAs have.

The honest summary: in `annotation` mode the cost today is zero modules compiled
and one regex per file, which is why it is the safe first commit. In `infer` mode
it is a Babel round trip on essentially every module in the app, and the only way
to know what that is worth is to run `pnpm --filter @simmer-mosquito/web build`
before and after.

## Concrete change, per app

### apps/web/vite.config.ts

`package.json`: add to `devDependencies`, alphabetical, between `@tailwindcss/vite`
and `@tanstack/react-query-devtools`:

```
"@babel/core": "^7.29.0",
"@rolldown/plugin-babel": "^0.2.4",
"babel-plugin-react-compiler": "^1.0.0",
```

`vite.config.ts`: two lines change.

```diff
 import tailwindcss from '@tailwindcss/vite';
+import babel from '@rolldown/plugin-babel';
 import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
-import react from '@vitejs/plugin-react';
+import react, { reactCompilerPreset } from '@vitejs/plugin-react';
 import { defineConfig } from 'vitest/config';
 import { version } from './package.json' with { type: 'json' };

 export default defineConfig({
 	envDir: '../..',
-	plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
+	plugins: [
+		TanStackRouterVite({ autoCodeSplitting: true }),
+		react(),
+		babel({ presets: [reactCompilerPreset({ compilationMode: 'annotation' })] }),
+		tailwindcss(),
+	],
```

Biome will want the import sorted; `@rolldown/plugin-babel` sorts before
`@tailwindcss/vite`, so the real diff puts it first. Nothing else in the file moves.
`build.rolldownOptions.codeSplitting` is untouched, and the `react-vendor` group
regex matches `node_modules` paths, which the compiler never rewrites.

`compilationMode: 'annotation'` is the argument for the first commit: 0 modules
compile, so the branch proves the wiring resolves and the build stays green
without changing a single output byte. Dropping the argument later is the second
commit and the one that needs a measurement.

### apps/admin/vite.config.ts

Identical change, identical three `devDependencies`. The file has no
`rolldownOptions` block, so the diff is only the two imports and the `plugins`
array. 53 modules.

### apps/preview/vite.config.ts

My recommendation is **no change**. 12 modules, a design-system gallery, nothing
that renders often enough for memoization to matter, and `defineConfig` there comes
from `vite` rather than `vitest/config`, which is the one config difference. If
#650 wants all three for consistency, the diff is the same as admin's.

## Loose ends

- `@vitejs/plugin-react` is on `^6.0.1` and npm `latest` is 6.1.1. Not blocking:
  the `@rolldown/plugin-babel` peer range is the same in both. But `^6.0.1` means
  the next `pnpm update` moves it, and 6.1.x adds an `oxc-transform-react` optional
  peer whose interaction with a Babel pass I did not check.
- I read `@rolldown/plugin-babel`'s options handling from `main` on GitHub and then
  verified each quoted literal against the published `0.2.4` tarball
  (`enforce: "pre"`, the node_modules exclude regex, `sourceMap ?? true`,
  `"typescript", "jsx"`). They agree. The `PluginOptions` interface and the include
  default I quote only from `main`, so treat those two as unverified against 0.2.4.
- react.dev's compilationMode page describes the `"use memo"` directive as
  "always respected, even in `'infer'` mode". The source supports that: the
  directive check runs before the mode switch. It does not say the directive is
  ignored at module scope, which the source is clear about. Follow the source.
- The React Compiler assumes Rules of React compliance and this repo lints with
  Biome, not `eslint-plugin-react-hooks`, so there is no `react-hooks/exhaustive-deps`
  gate standing behind it. Biome's `useExhaustiveDependencies` is the nearest thing
  and I did not check whether it is on. Worth a look before leaving `annotation`
  mode.
