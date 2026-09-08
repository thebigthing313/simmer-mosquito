# What eslint-plugin-react-hooks gives us, and what ESLint beside Biome costs

Status: Research for
[#651](https://github.com/thebigthing313/simmer-mosquito/issues/651). Nothing is
built. No file in the repo was changed. Every number below was measured on this
checkout on 2026-09-07, against `develop` at `77e5c1d2`, or read out of a
published npm artifact or a primary document, and each is cited.

Every measurement ran from four throwaway installs under the session scratchpad,
never from the workspace, so the workspace lockfile and `node_modules` are
untouched.

## The answer in one screen

Adopt it, at v7 rather than v6, with `@typescript-eslint/parser` pinned against a
private `typescript@6.0.3` the same way Nx already is.

- The compiler rules are the compiler. The rule body calls
  `babel.transformFromAstSync` with `BabelPluginReactCompiler` and reports the
  diagnostics it collects. This is not a lighter reimplementation.
- What it reports is a filtered view of what the compiler bails on, and the
  filter has four gates. Three of them are silent.
- v6 is two majors behind and does not put the compiler rules in `recommended`.
  Use v7.1.1, where `flat.recommended` carries 16 rules.
- **TypeScript 7 is a real blocker for `typescript-eslint` and it is not a
  warning, it is a thrown error at import.** Two workarounds both work and both
  were run here.
- Cost on this repo: 1090 files, 29.6s serial or 17.6s with
  `--concurrency=auto`. Biome's whole `pnpm check` over 1710 files is 3.9s. So
  ESLint is roughly five to eight times the existing style gate.
- Adopting it at zero diagnostics is 107 findings to fix or suppress first.
- There is no overlap with Biome today, because **Biome's react domain is off in
  this repo**, which I did not expect and verified twice.

## The rule set, read off the published artifact

The rule table is not in the README in a form you can trust. It is
`getRuleForCategoryImpl` in the shipped bundle, one `case` per
`ErrorCategory`. I extracted it from
`cdn.jsdelivr.net/npm/eslint-plugin-react-hooks@<version>/cjs/eslint-plugin-react-hooks.development.js`
for 6.0.0, 6.1.1 and 7.1.1.

**6.0.0 has no compiler rules at all.** The string
`set-state-in-effect` does not appear in the bundle, and there is no `LintRules`
table. The compiler rules arrive in 6.1.0. So "v6" as a version is ambiguous, and
the useful v6 is 6.1.1.

v7.1.1 `configs.flat.recommended`, dumped by `node -e` from a real install, is
these 16 rules:

| Rule | Severity | What it reports |
| --- | --- | --- |
| `rules-of-hooks` | error | The classic rule. Not a compiler rule. |
| `exhaustive-deps` | warn | The classic rule. Not a compiler rule. |
| `config` | error | The compiler configuration options are invalid. |
| `error-boundaries` | error | `try`/`catch` used where an error boundary belongs. |
| `gating` | error | Gating mode is misconfigured. |
| `globals` | error | A global is assigned or mutated during render. |
| `immutability` | error | Props, state or another immutable value is mutated. |
| `incompatible-library` | warn | A library API that returns unmemoizable functions. |
| `preserve-manual-memoization` | error | Existing `useMemo`/`useCallback` could not be preserved, so the component is skipped. |
| `purity` | error | A known-impure function is called during render. |
| `refs` | error | A ref is read or written during render. |
| `set-state-in-effect` | error | `setState` called synchronously in an effect. |
| `set-state-in-render` | error | `setState` called during render. |
| `static-components` | error | A component is created during render. |
| `unsupported-syntax` | warn | Syntax the compiler does not plan to support. |
| `use-memo` | error | A `useMemo` misuse. |

Source for the severities and the descriptions: the `case` bodies in the 7.1.1
bundle, matching
[`ReactCompiler.ts`](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/src/shared/ReactCompiler.ts)
on `main`. Fourteen of the sixteen are compiler rules.

Eleven more compiler categories exist and ship `Off` in 7.1.1:
`capitalized-calls`, `memoized-effect-dependencies`,
`exhaustive-effect-dependencies`, `no-deriving-state-in-effects`, `fbt`,
`hooks`, `invariant`, `rule-suppression`, `syntax`, `todo`, `memo-dependencies`.
One, `void-use-memo`, is `RecommendedLatest`, so it is on only in
`recommended-latest`. Turning any of these on is a rule name in `rules`.

### v6 puts the compiler rules somewhere else, and the docs disagree about it

Dumped from a real 6.1.1 install:

- `configs.recommended` (flat) is `rules-of-hooks: error` and
  `exhaustive-deps: warn`. **Nothing else.**
- `configs['recommended-latest']` (flat) is those two plus 15 compiler rules,
  including `component-hook-factories`, which v7.1.0 deprecated and 7.1.1 no
  longer defines.
- There is no `configs.flat['recommended-latest']` in 6.1.1. The keys are
  `recommended-legacy`, `recommended-latest-legacy`, `flat/recommended`,
  `recommended-latest`, `recommended`.

In 7.1.1 the compiler rules moved into `recommended`:
`recommendedRuleConfigs = {...basicRuleConfigs, ...recommendedCompilerRuleConfigs}`
in the bundle, and `configs.flat` gained both `recommended` and
`recommended-latest`.

Two react.dev pages contradict each other and one of them contradicts the v6
artifact.

- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1),
  dated the day 7.0.0 was published, says "Compiler-powered lint rules ship in
  `eslint-plugin-react-hooks`'s `recommended` and `recommended-latest` preset."
  That is true of v7 and false of the v6.1.1 on npm at the time.
- [React Compiler installation](https://react.dev/learn/react-compiler/installation)
  says "The compiler rules are available in the `recommended-latest` preset",
  which is the v6 shape.
- [The eslint-plugin-react-hooks
  reference](https://react.dev/reference/eslint-plugin-react-hooks) lists 17
  recommended rules including `component-hook-factories`, which is the v6.1.1
  `recommended-latest` set exactly, not v7's 16.

So the reference page is describing v6 and the blog is describing v7. Read the
artifact, not the page. The `node -e` dump above is the way to settle it in ten
seconds against whatever version you install.

## Is it the compiler's analysis, or a lighter one

It is the compiler's, run per file, in process.

The mechanism is `runReactCompilerImpl` in the shipped bundle
(`p_6.1.1.js:54157`, same shape at 7.1.1). It parses the file with
`@babel/parser` under the `typescript` and `jsx` plugins, then:

```js
core.transformFromAstSync(babelAST, sourceCode.text, {
  filename,
  plugins: [[BabelPluginReactCompiler, options]],
  sourceType: 'module',
  configFile: false,
  babelrc: false,
});
```

The options it passes are fixed:

```js
const COMPILER_OPTIONS = {
  noEmit: true,
  panicThreshold: 'none',
  flowSuppressions: false,
  environment: { validateRefAccessDuringRender: true, validateNoSetStateInRender: true, ... },
};
```

merged over `context.options[0]`, so a rule's option object is the compiler
config. Results are cached in a 10-entry LRU keyed on filename, source text and a
deep-equal options object, so one compile serves all sixteen rules of a file as
long as they share one option set.

Each rule's `create` then walks the collected events and reports the ones whose
category is its own:

```js
for (const event of result.events) {
  if (event.kind === 'CompileError') {
    const detail = event.detail;
    if (detail.category === rule.category) { ... context.report(...) }
  }
}
return {};
```

`return {}` is worth noticing. **The compiler rules register no AST visitors at
all.** They never look at the ESLint AST. That has a consequence for the parser
choice, below.

So the analysis is the same analysis. The **reported set** is narrower than the
set of components the compiler skips, through four gates:

1. **Category not enabled.** Only diagnostics whose category matches an enabled
   rule are reported. Eleven categories ship `Off`. A bail-out in one of those is
   invisible with no signal that anything happened.
2. **No primary location.** `if (loc == null || typeof loc === 'symbol')
   continue`. Silent.
3. **Thrown exceptions.** Both the Babel parse and the transform sit in bare
   `try { } catch (err) { }` blocks with empty bodies. A file the parser cannot
   read produces zero events and lints clean. Silent.
4. **Event kind.** The bundle defines `CompileSkip`, `CompileSuccess`,
   `CompileDiagnostic`, `PipelineError` and `Timing` event kinds, and the rule
   reads only `CompileError`. A component the compiler skips for a reason that is
   not a compile error, such as an annotation-only `compilationMode` with no
   `"use memo"` directive, is not reported.

There is a fifth divergence that is not a filter. The lint run uses
`COMPILER_OPTIONS` above, and a real build uses whatever
`babel-plugin-react-compiler` is configured with in the Vite config. If those
differ, so do the answers. This repo runs no compiler at all today
(`apps/web/package.json` has `@vitejs/plugin-react` and no
`babel-plugin-react-compiler`), so there is nothing to diverge from yet.

react.dev states the direction of the relation but not the filters: "When the
ESLint rule reports an error, it means the compiler will skip optimizing that
specific component or hook"
([installation](https://react.dev/learn/react-compiler/installation)). That is
the sound direction. The converse, every skip produces a report, is what the four
gates above break, and no react.dev page claims it.

One more primary-source point worth keeping: "The linter does not require the
compiler to be installed, so there's no risk in upgrading
eslint-plugin-react-hooks"
([React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1)). The
plugin bundles the compiler; `@babel/core` and `@babel/parser` are its own
dependencies
([npm metadata for 7.1.1](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1)).
Adopting the rules does not commit us to compiling.

## The TypeScript 7 blocker, and two ways past it

`typescript-eslint@8.70.0` declares `typescript: '>=4.8.4 <6.1.0'`
([npm](https://registry.npmjs.org/typescript-eslint/latest)). This workspace is
on `typescript@7.0.2` (root `package.json`). pnpm installs it with a peer warning
on eight packages, and then ESLint dies at config load:

```
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
Error: typescript-eslint does not support TS 7.0.
    at .../typescript-eslint/dist/index.js:52:11
```

That is a deliberate `throw` at module scope, not a crash. Microsoft's own
announcement says why: "TypeScript 7.0 does not ship with an API. We expect
TypeScript 7.1 to ship with a new (and different) API, but until then we have
made it a priority to ensure TypeScript can be run side-by-side with TypeScript
6.0 for utilities that still need some programmatic access to the compiler (such
as typescript-eslint)"
([Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
It names typescript-eslint. It is the same removal that already forces
`pnpm.packageExtensions` to give Nx a private `typescript@6.0.3`.

[typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)
is closed as not planned and duplicated into
[#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940),
which tracks tsgo support and is open.

**Workaround A, the one that matches this repo's habits.** Give the linter its
own TypeScript 6. In a probe with `typescript@6.0.3` at the root and no TS 7,
`pnpm add -D eslint@9 eslint-plugin-react-hooks@6.1.1 typescript-eslint@8 typescript@6.0.3`
installs with **zero peer warnings** and lints all 1090 files. The same holds for
`eslint@10 + eslint-plugin-react-hooks@7.1.1 + typescript-eslint@8 + typescript@6.0.3`.

The `pnpm.packageExtensions` trick that works for Nx does **not** work here as
written. I tried it: adding `typescript: 6.0.3` as a dependency of the eight
`@typescript-eslint/*` packages left them still resolved against
`typescript@7.0.2`, because typescript is a *peer* dependency there and pnpm
satisfies a peer from the parent ahead of an injected dependency. The install
directory name stayed `typescript-eslint@8.70.0_eslint@10.10.0_typescript@7.0.2`
and the throw was unchanged. What would work is the aliased compatibility
package Microsoft published for this, `@typescript/typescript6`, or an
ESLint-only workspace package that declares `typescript@6.0.3` as its own
dependency so pnpm resolves the peer there.

**Workaround B, and it is cleaner than A.** Do not use `typescript-eslint` at
all. Because the compiler rules register no AST visitors and parse the source
themselves, and because `rules-of-hooks` and `exhaustive-deps` need no type
information, the ESLint parser only has to not throw. A probe with
`@babel/eslint-parser` and `@babel/preset-typescript`, and **no `typescript`
package anywhere in it**, produced byte-identical results to the
`typescript-eslint` run: 1090 files, 102 messages, the same distribution across
all nine rule ids. 44 MB of `node_modules` against 74 MB, and the TypeScript 7
question stops existing.

The cost of B is a different pin. `@babel/eslint-parser@7.29.7` fails on ESLint
10 with `TypeError: scopeManager.addGlobals is not a function` in
`source-code.js:221`, so B is stuck on ESLint 9, which npm already marks
deprecated, and gives up ESLint 10's `--concurrency`. On this corpus that is 36.3s
against 17.6s. I would take A for that reason, but B is the honest fallback if
the TS 6 pin turns out to be awkward.

## Which Biome rules would overlap, and the surprise

Read `biome.json`. The linter block is:

```json
"linter": { "rules": { "recommended": true, "correctness": { "noUnusedImports": "error", "noUnusedVariables": "error" } } }
```

No `domains` key. Biome's react domain is
[auto-enabled from a `react` dependency in package.json](https://biomejs.dev/linter/domains/),
so I expected it on in `apps/web`, `apps/admin` and `packages/ui-web`. It is not.

`biome rage --linter` reports 208 enabled rules, from the workspace root and from
inside `apps/web`, and `correctness/useExhaustiveDependencies`,
`correctness/useHookAtTopLevel`, `correctness/noChildrenProp`,
`suspicious/noArrayIndexKey` and `security/noDangerouslySetInnerHtml` are not
among them. I confirmed it a second way, on behaviour rather than on a rule list:
a scratch component with an empty dependency array that drops `id` produces no
diagnostic under the repo's config, and the same file under
`{"linter":{"domains":{"react":"recommended"}}}` produces
`correctness/useExhaustiveDependencies` with an unsafe autofix.

So **there is no overlap today**, and the choice about overlap is ours to make.

Three facts to make it with, all measured on this checkout.

1. Turning Biome's react domain on at `recommended` costs nothing. With the
   repo's real `files.includes` exclusions in place, `biome lint` over
   `apps/web/src`, `apps/admin/src` and `packages/ui-web/src` reports **zero
   findings** across 1059 files. The findings a naive run turns up (2
   `useExhaustiveDependencies`, 4 `noArrayIndexKey`, 1
   `noDangerouslySetInnerHtml`) are all inside
   `packages/ui-web/src/components/ui`, which `biome.json` already excludes.
2. Biome's `useExhaustiveDependencies` is materially weaker than ESLint's
   `exhaustive-deps` on this code. ESLint reports 12 findings, in 12 files that
   Biome does lint, on built-in hooks (`useEffect`, `useMemo`, `useCallback`).
   Biome finds none of them. I checked three of the files individually under the
   forced-domain config and Biome reports clean:
   `apps/web/src/components/map/use-map-padding.ts:48`,
   `apps/web/src/components/search/use-search-navigation.ts:85`,
   `apps/web/src/routes/search.tsx:368`. They are not a disagreement about a
   line, which is the failure mode the issue asks about. They are a difference in
   reach.
3. Turning Biome's react domain on at `all` is a different proposition and not
   one to take by accident: 470 `style/useComponentExportOnlyModules` warnings,
   29 `correctness/useUniqueElementIds` errors, 1
   `style/useReactFunctionComponents`. None of those overlaps an ESLint rule
   discussed here.

**Recommendation on overlap: leave Biome's react domain off and let ESLint own
the React rules.** Two linters holding one rule is how a suppression comment ends
up needing two syntaxes, and the Biome side is the weaker of the two on the only
rule where both have a real opinion. The alternative, turning the domain on and
keeping ESLint to the fourteen compiler rules only by writing
`react-hooks/exhaustive-deps: off` and `react-hooks/rules-of-hooks: off`, is
defensible and costs nothing today, but it splits one concern across two config
files.

Nothing in the ESLint config proposed here touches formatting, so there is no
conflict with the Biome formatter. Keep it that way: no `stylistic` plugin, no
`eslint-config-prettier` need, no rule that reformats.

## The flat config for three React projects in a nine-project workspace

ESLint flat config globs are relative to the config file's directory, or to the
cwd when `--config` is used
([configuration files](https://eslint.org/docs/latest/use/configure/configuration-files)).
One `eslint.config.js` at the workspace root, scoping the plugin with `files`, is
the shape. The alternative, `basePath`, exists for subdirectory scoping but buys
nothing when the scoping is already a glob.

```js
// eslint.config.js at the workspace root
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const REACT_PROJECTS = [
	'apps/web/src/**/*.{ts,tsx}',
	'apps/admin/src/**/*.{ts,tsx}',
	'packages/ui-web/src/**/*.{ts,tsx}',
];

export default defineConfig([
	globalIgnores([
		'**/dist/',
		'**/coverage/',
		'.nx/',
		'**/routeTree.gen.ts',
		'packages/ui-web/src/components/ui/',
	]),
	{
		files: REACT_PROJECTS,
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: { ecmaFeatures: { jsx: true } },
		},
		extends: [reactHooks.configs.flat.recommended],
	},
]);
```

Four notes on that.

- The six non-React projects match no config object, so ESLint lints nothing in
  them. That is the whole scoping mechanism and it needs no per-project config
  files.
- The ignores mirror `biome.json`'s `files.includes` so the two gates agree about
  what code is in scope. `routeTree.gen.ts` matters: it is the one file in the
  repo carrying an `eslint-disable` directive already, and ESLint reports
  "Unused eslint-disable directive" on both generated route trees if you lint
  them.
- `packages/ui-web/src/components/ui` is excluded to match Biome. Including it
  adds 3 findings (`purity` on `Math.random` in `sidebar.tsx:589` among them),
  and that directory is vendored shadcn source the repo has already decided not
  to lint.
- No `parserOptions.project` and no `projectService`. See the next section.

## Dependency footprint and whether type-aware rules are needed

**Type-aware rules are not required and should not be turned on.** Every rule
discussed here is syntactic: the two classic rules work off the ESLint AST, and
the fourteen compiler rules work off their own Babel parse and register no
visitors at all. Adding `projectService` would build a TypeScript program per
project purely to feed rules that never ask it a question. The measured evidence
is the `@babel/eslint-parser` probe: identical output with no TypeScript package
in the install.

Minimum footprint, ESLint 10 route, measured in a real pnpm install:

| Package | Version | On disk |
| --- | --- | --- |
| `eslint` | 10.10.0 | 3.9 MB |
| `eslint-plugin-react-hooks` | 7.1.1 | 4.1 MB (bundles the compiler) |
| `typescript-eslint` | 8.70.0 | 3.4 MB plus 3.1 MB across nine `@typescript-eslint/*` packages |
| `typescript` (private, for the parser) | 6.0.3 | 24 MB |
| total `node_modules` | | **74 MB**, 150 entries in `.pnpm` |

The `@babel/eslint-parser` route drops the last two rows and lands at **44 MB**.

Peer ranges worth knowing:

- `eslint-plugin-react-hooks@6.1.1` peers `eslint` at `^3 || ... || ^9`. It
  installs against ESLint 10 with a warning and it runs, but it does not declare
  support. `7.1.1` adds `^10.0.0`
  ([npm](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1)). Another
  reason to take v7.
- `typescript-eslint@8.70.0` peers `eslint` at `^8.57 || ^9 || ^10`, and
  `typescript` at `>=4.8.4 <6.1.0`.
- Both plugins need Node `>=18`. CI is on 22.16.0.

## What a run costs

The corpus, from `git ls-files`:

| Project | `.ts`/`.tsx` under `src` |
| --- | --- |
| `apps/web/src` | 875 |
| `apps/admin/src` | 53 |
| `packages/ui-web/src` | 162 |
| **total** | **1090** |

178,000 lines, of which 3,248 are the two generated route trees. ESLint linted
exactly 1090 files in every run, which is the check that the globs are right.

Wall clock on this machine (Windows, 12 cores, warm filesystem, cold ESLint
process each time):

| Run | Files | Time | Findings |
| --- | --- | --- | --- |
| `pnpm check` (Biome, whole workspace) | 1710 | **3.9s** | 0 |
| ESLint 9, `recommended` only, two classic rules | 1090 | 10.4s | 12 |
| ESLint 9, v6.1.1 `recommended-latest`, tseslint parser | 1090 | 35.5s | 102 |
| ESLint 9, v6.1.1 `recommended-latest`, babel parser | 1090 | 36.3s | 102 |
| ESLint 10, v7.1.1 `flat.recommended`, serial | 1090 | 29.6s | 109 |
| ESLint 10, v7.1.1 `flat.recommended`, `--concurrency=auto` | 1090 | **17.6s** | 109 |

Read the difference between rows two and five as the price of the compiler: about
20 seconds and 95 extra findings. That is a per-file Babel parse and a full
compiler pipeline run on 1090 files, and the 10-entry LRU cache means the cost is
paid once per file rather than once per rule.

A GitHub Actions runner is slower per core than this machine and `ubuntu-latest`
gives 4 cores rather than 12, so budget **40 to 60 seconds** for the job, plus
whatever the install costs. `verify` has a 15 minute timeout and currently runs
`pnpm check` in about a second's work by its own comment, so this is the single
most expensive static gate in the job by an order of magnitude. It is still small
next to `typecheck` and `build`.

`--concurrency` accepts an integer, `auto` or `off`, and defaults to `off`
([CLI docs](https://eslint.org/docs/latest/use/command-line-interface)). Use
`auto`. It is worth 40% here and it is ESLint 10 only, which is another reason
the plugin has to be v7.

## What adoption actually costs on day one

`pnpm check` gates at zero diagnostics including warnings, with no allowance
list. An ESLint gate written the same way starts at 107 real findings. The v7.1.1
run:

| Rule | Count | Severity |
| --- | --- | --- |
| `react-hooks/refs` | 56 | error |
| `react-hooks/set-state-in-effect` | 33 | error |
| `react-hooks/exhaustive-deps` | 12 | warn |
| `react-hooks/immutability` | 2 | error |
| `react-hooks/static-components` | 2 | error |
| `react-hooks/incompatible-library` | 1 | warn |
| `react-hooks/purity` | 1 | error |
| unused `eslint-disable` directive | 2 | warn |

Across 50 distinct files, 89 in `apps/web`, 12 in `packages/ui-web` (of which 3
are in the excluded `components/ui`), 1 in `apps/admin`. `apps/admin` is
otherwise clean.

The v6.1.1 numbers differ, which is worth knowing before anyone compares two
branches: 50 `refs` instead of 56, 28 `set-state-in-effect` instead of 33, 3
`immutability` instead of 2, and 3 `preserve-manual-memoization` that v7 does not
report at all. The rule is the same name in both. The analysis behind it moved.

Samples, so the shape is concrete rather than a count:

- `apps/web/src/components/catalog/catalog-record-dialog.tsx:117`, `refs`:
  "Cannot access refs during render".
- `apps/web/src/components/explorer/use-map-bounds.ts:26`,
  `set-state-in-effect`: "Calling setState synchronously within an effect can
  trigger cascading renders".
- `apps/web/src/components/search/search-result-row.tsx:45`,
  `static-components`: "Cannot create components during render".
- `apps/web/src/components/search/search-palette.tsx:80`, `immutability`:
  "`opening` is accessed before it is declared".
- `apps/web/src/components/explorer/result-list.tsx:187`,
  `incompatible-library`: "Compilation Skipped: Use of incompatible library".
- `packages/ui-web/src/components/ui/sidebar.tsx:589`, `purity`: `Math.random`
  called during render. Vendored shadcn, in the excluded directory.

56 `refs` findings in one codebase is the number to look at before deciding this
is free. Either that is 56 real Rules of React violations, which would be worth
knowing, or the rule is noisy against a pattern this app uses deliberately, which
would be worth knowing sooner. **Nobody should merge an ESLint gate without
reading a sample of those 56 first.** That is the one open question this note
does not answer, and it is a code review rather than more research.

The staging path for it is the one this repo already uses on
`UNCHECKED_ACKNOWLEDGEMENTS` and `UNCOVERED_MODULES`: ship at the backlog with a
checked-in count that fails when the number moves in either direction, then walk
it down. That does mean an ESLint gate would be the first one whose backlog lives
in a config file rather than in a `scripts/check-*.mjs` register, which is a
small departure from how every other gate here is shaped.

## Sources

Primary, in the order they settle something.

- The shipped artifacts, read directly:
  `https://cdn.jsdelivr.net/npm/eslint-plugin-react-hooks@{6.0.0,6.1.1,7.1.1}/cjs/eslint-plugin-react-hooks.development.js`.
  These are the authority for the rule table, the severities, the config
  contents and the compiler invocation.
- [`ReactCompiler.ts` on
  `main`](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/src/shared/ReactCompiler.ts)
  and [`index.ts`](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/src/index.ts),
  the source the bundles compile from.
- [`README.md` on
  `main`](https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/README.md).
  Describes v7. Do not read it for v6.
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1),
  [React Compiler installation](https://react.dev/learn/react-compiler/installation),
  [eslint-plugin-react-hooks reference](https://react.dev/reference/eslint-plugin-react-hooks).
  These three do not agree with each other about which preset carries the
  compiler rules. Section "The rule set" above says which is right for which
  version.
- [Announcing TypeScript
  7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
  The statement that 7.0 ships no API and that typescript-eslint is one of the
  tools that must stay on 6.0.
- [typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)
  (closed, not planned) and
  [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
  (open, tsgo tracking).
- [ESLint configuration
  files](https://eslint.org/docs/latest/use/configure/configuration-files) and
  [CLI](https://eslint.org/docs/latest/use/command-line-interface).
- [Biome linter domains](https://biomejs.dev/linter/domains/).
- npm registry metadata for `eslint-plugin-react-hooks`, `typescript-eslint`,
  `@typescript-eslint/parser` and `eslint`.
- This checkout: `biome.json`, root `package.json`, `apps/web/package.json`,
  `packages/ui-web/package.json`, `.github/workflows/ci.yml`, and `git ls-files`
  for every count.

Secondary, and marked as such: the web search summary that first pointed at
`--concurrency` and at issue #10940. Every claim it produced was re-read against
the ESLint CLI docs and the issue itself before it appears above.

## Limits of this note

- Every timing is one machine, one run, warm cache, Windows. The CI budget is an
  extrapolation and should be measured on a runner before anyone cites it.
- I did not read the 56 `refs` findings. Whether they are real is the question
  that decides this, and it is not answered here.
- I did not test `oxc-parser`, `hermes-eslint` or ESLint 10's own TypeScript
  handling as third parser options. Two routes both work; a third was not worth
  the install.
- I did not measure the incremental cost of the ESLint install on CI, only the
  disk size. `pnpm install --frozen-lockfile` is cached by
  `actions/setup-node`, so the marginal cost is probably small, but it is
  unmeasured.
- `pnpm.packageExtensions` was tested and does not solve the TypeScript 7 peer.
  The `@typescript/typescript6` alias route is the documented one and I did not
  run it end to end; only the plain `typescript@6.0.3` install was proven.
