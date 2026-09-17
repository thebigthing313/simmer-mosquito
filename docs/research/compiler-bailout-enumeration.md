# Enumerating React Compiler bail-outs

Answers [#652](https://github.com/thebigthing313/simmer-mosquito/issues/652).

Sources are the React Compiler source in `facebook/react` at `main`, the
published `.d.ts` of `babel-plugin-react-compiler` on npm, the npm registry
metadata, and react.dev. Everything labelled "measured" was run against this
checkout on 2026-09-07 with `babel-plugin-react-compiler@1.0.0` and
`react-compiler-healthcheck@0.0.0-experimental-a1856f3-20260507`, installed into
a scratchpad, not into the workspace. No file in the repo was changed. One claim
below is sourced from a web search summary and is marked as secondary.

## Recommendation

Write `scripts/check-compiler-bailouts.mjs` in the house shape and drive the
Babel plugin directly with a `logger`. Do not use `react-compiler-healthcheck`.
The gate needs three settings, and the third is the one that is easy to get
wrong:

```js
{ noEmit: true, compilationMode: 'infer', panicThreshold: 'none', logger }
```

`compilationMode: 'infer'` and not `'annotation'`. The count you want is "which
components would fail if we opted them in", and in `annotation` mode a file that
has not opted in emits no event at all, so the gate would report zero for the
whole rollout and say nothing. `panicThreshold: 'none'` because any other value
aborts the file at the first error and hides every later function in it.
`noEmit: true` because the gate reads events, not output.

That gives a count, a file list, and a category per finding, over 1,102 modules
in 34 seconds. The measured numbers for this repo are below.

## What `babel-plugin-react-compiler` exposes

### The `logger` option

`Logger` is a two-method object. The plugin calls `logEvent` once per event, and
`debugLogIRs` is unrelated to bail-outs. From
[`compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Options.ts`](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Options.ts):

```ts
export type Logger = {
  logEvent: (filename: string | null, event: LoggerEvent) => void;
  debugLogIRs?: (value: CompilerPipelineValue) => void;
};
```

Both `Logger` and `LoggerEvent` are exported types in the published package.
Confirmed against `babel-plugin-react-compiler@1.0.0`'s `dist/index.d.ts`
(https://unpkg.com/babel-plugin-react-compiler@1.0.0/dist/index.d.ts), whose
export list carries `type Logger, type LoggerEvent, type PluginOptions,
ErrorSeverity`. The package declares `"types": "./dist/index.d.ts"` (npm
registry, `registry.npmjs.org/babel-plugin-react-compiler/1.0.0`), so a
`.mjs` gate gets no types but a future TypeScript port would.

react.dev documents the option and shows the same call shape at
[reference/react-compiler/configuration](https://react.dev/reference/react-compiler/configuration),
which describes `logger` as providing "custom logging for compilation events".

### The event union

`LoggerEvent` on `main` today has seven members:

```ts
export type LoggerEvent =
  | CompileSuccessEvent
  | CompileErrorEvent
  | CompileDiagnosticEvent
  | CompileSkipEvent
  | CompileUnexpectedThrowEvent
  | PipelineErrorEvent
  | TimingEvent;
```

The member shapes, same file:

```ts
export type CompileSuccessEvent = {
  kind: 'CompileSuccess';
  fnLoc: t.SourceLocation | null;
  fnName: string | null;
  memoSlots: number;
  memoBlocks: number;
  memoValues: number;
  prunedMemoBlocks: number;
  prunedMemoValues: number;
};

export type CompileErrorEvent = {
  kind: 'CompileError';
  fnLoc: t.SourceLocation | null;
  detail: CompileErrorDetail;
};

export type CompileDiagnosticEvent = {
  kind: 'CompileDiagnostic';
  fnLoc: t.SourceLocation | null;
  detail: Omit<Omit<CompilerErrorDetailOptions, 'severity'>, 'suggestions'>;
};

export type CompileSkipEvent = {
  kind: 'CompileSkip';
  fnLoc: t.SourceLocation | null;
  reason: string;
  loc: t.SourceLocation | null;
};

export type CompileUnexpectedThrowEvent = {
  kind: 'CompileUnexpectedThrow';
  fnLoc: t.SourceLocation | null;
  data: string;
};

export type PipelineErrorEvent = {
  kind: 'PipelineError';
  fnLoc: t.SourceLocation | null;
  data: string;
};

export type TimingEvent = {
  kind: 'Timing';
  measurement: PerformanceMeasure;
};
```

The published `1.0.0` union differs from `main` and is what a gate would
actually receive today. Its `.d.ts` has eight members: the same seven less
`CompileUnexpectedThrowEvent`, plus `AutoDepsDecorationsEvent` and
`AutoDepsEligibleEvent`, and its `CompileErrorEvent.detail` is typed
`CompilerErrorDetail | CompilerDiagnostic` rather than `CompileErrorDetail`.
Read that as churn, not as a contradiction. See "Stability across versions".

Only three kinds matter to this issue. `CompileError` is a bail-out.
`CompileDiagnostic` is a non-fatal finding on a function that still compiles.
`CompileSkip` is an explicit opt-out, and it is the deliberate one the
acceptance criterion is about.

### The `detail` on a `CompileError`

Measured. At runtime the `detail` is a `CompilerErrorDetail` instance carrying
`reason`, `description`, `severity`, `loc`, `suggestions`, `category`,
`primaryLocation()`, `printErrorMessage()` and `toString()`. `category` is the
useful key for grouping, and `primaryLocation().start` gives line and column of
the offending expression while the event's own `fnLoc.start` gives the start of
the function that bailed.

`ErrorCategory` in
[`CompilerError.ts`](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/CompilerError.ts)
has 26 members on `main` and 26 at runtime in `1.0.0`: `Hooks`,
`CapitalizedCalls`, `StaticComponents`, `UseMemo`, `VoidUseMemo`,
`PreserveManualMemo`, `MemoDependencies`, `IncompatibleLibrary`, `Immutability`,
`Globals`, `Refs`, `EffectDependencies`, `EffectExhaustiveDependencies`,
`EffectSetState`, `EffectDerivationsOfState`, `ErrorBoundaries`, `Purity`,
`RenderSetState`, `Invariant`, `Todo`, `Syntax`, `UnsupportedSyntax`, `Config`,
`Gating`, `Suppression`, `FBT`. `ErrorSeverity` is four members on `main` and in
`1.0.0`: `Error`, `Warning`, `Hint`, `Off`.

### One trap in the `filename` argument

Measured. The `filename` handed to `logEvent` is whatever Babel resolved the
`filename` transform option to, which is absolute even when a relative path was
passed in. A gate that prints it gets a machine-specific path, so relativize
against the workspace root, or track the path yourself in the loop and ignore
the argument. The sweep below does the second.

### `panicThreshold`

`PanicThresholdOptions` is `'all_errors' | 'critical_errors' | 'none'`
(`Options.ts`, and the `PanicThresholdOptionsSchema` it infers from).
[`Program.ts`](https://github.com/facebook/react/blob/main/compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Program.ts)
is where it decides:

```js
if (
  context.opts.panicThreshold === 'all_errors' ||
  (context.opts.panicThreshold === 'critical_errors' && isError(err)) ||
  isConfigError(err)
) {
  throw err;
}
```

A config error always throws regardless of the setting.

Measured, on a four-function probe file with a conditional hook, a ref write in
render, a `setState` in render and a prop mutation:

| `panicThreshold` | events logged |
| --- | --- |
| `'none'` | `CompileError` 5, `CompileSuccess` 1 |
| `'critical_errors'` | `CompileError` 1, then the transform throws |
| `'all_errors'` | `CompileError` 1, then the transform throws |

The two non-`none` values behave identically here, because the current severity
model resolves every one of these to `ErrorSeverity.Error`. The point for the
gate is the first row: only `'none'` walks the whole file. Any other value turns
a file with four bail-outs into a file with one, and the other three are never
reported. react.dev says the same thing in product terms at
[reference/react-compiler/configuration](https://react.dev/reference/react-compiler/configuration),
recommending `panicThreshold: 'none'` for production so the compiler skips
components with errors instead of failing the build.

### There is no other reporting hook

I found no separate diagnostics API, no report file, and no CLI on the plugin.
`logger` is the whole surface. The ESLint side is a different package
(`eslint-plugin-react-hooks`) and reports per line in an editor rather than
producing a count.

## The distinction the issue asks to preserve

A file that has not opted in is not a bail-out, and the compiler agrees at the
event level. From `Program.ts`:

```js
} else if (
  programContext.opts.compilationMode === 'annotation' &&
  directives.optIn == null
) {
  /**
   * If no opt-in directive is found and the compiler is configured in
   * annotation mode, don't insert the compiled function.
   */
  return null;
}
```

Measured on a four-function file holding one un-annotated component, one
`'use memo'` that compiles, one `'use memo'` that bails on a ref write, and one
`'use no memo'`:

| mode | events |
| --- | --- |
| `annotation` | `CompileSuccess` 1, `CompileError` 3 |
| `infer` | `CompileSuccess` 2, `CompileError` 3, `CompileSkip` 1 |

In `annotation` mode the un-annotated component emits nothing, and so does the
`'use no memo'` one, because in that mode the opt-out has nothing to opt out of.
So the three states are separable, but only by reading two runs:

- **Deliberate opt-out.** A `CompileSkip` in an `infer` run. Its `fnLoc` names
  the function.
- **Bail-out.** A `CompileError` in an `infer` run.
- **Not opted in yet.** A `CompileSuccess` in an `infer` run with no `'use memo'`
  in the source. Silence in `annotation` mode, which is why an
  `annotation`-mode gate cannot see this state at all.

One defect worth knowing. Measured on `1.0.0`, the `CompileSkip.reason` string
renders as `Skipped due to '[object Object]' directive.`, so it does not name
which of the four opt-out spellings was used. `main` builds the same string from
`directives.optOut.value.value`, so the interpolation is reaching an object.
The `fnLoc` is still correct, so a gate should read the source at that location
rather than parse the reason. The four directive strings are exported at
runtime: `OPT_IN_DIRECTIVES` is `['use forget', 'use memo']` and
`OPT_OUT_DIRECTIVES` is `['use no forget', 'use no memo']`.

react.dev's
[directives page](https://react.dev/reference/react-compiler/directives) and
[compilationMode page](https://react.dev/reference/react-compiler/compilationMode)
document `annotation` as "only compile functions explicitly marked with the
`use memo` directive. Ideal for incremental adoption", and say that regardless
of mode, functions with `"use no memo"` are always skipped.

## `react-compiler-healthcheck` is published but its counting is broken

### Maintenance

It is still published, on the same nightly cadence as the plugin. The registry
holds 411 versions, `latest` is `1.0.0` published 2025-10-07, and the newest
nightly is `0.0.0-experimental-a1856f3-20260507` published 2026-05-08. I checked
`npm view react-compiler-healthcheck deprecated` and it returns nothing, so the
package carries no deprecation notice. An earlier automated read of the raw
packument claimed `1.0.0` was deprecated with the text "This is a bad release:
please install from the experimental tag instead". That claim did not survive
`npm view` and I am recording it as wrong.

A web search result asserted the React team plans to deprecate the package
because it "can spread the misconception that you need to have all your
components successfully compiled before you can use the compiler". **That is
secondary and I could not find it in a primary source.** I read
[issue #29078](https://github.com/facebook/react/issues/29078), which asks the
healthcheck to list compiled files and was closed as not planned and stale, and
it carries no such statement in what I could fetch.

The source has not been touched in substance for eleven months. The last five
commits under
`compiler/packages/react-compiler-healthcheck` (GitHub commits API) are
2026-06-12 "Update required references to GitHub repo (#36752)", 2025-10-16
"[compiler] improve zod v3 backwards compat (#34877)", 2025-10-03 "[compiler]
Update for Zod v3/v4 compatibility (#34717)", 2025-09-22 "[compiler] Export
`PluginOptions` as a type...", and 2025-04-24 "[compiler] Add missing
copyrights (#33004)". The 2026 commit is a link update.

### It runs on this repo and reports a wrong number

Measured. It handles the size and shape without complaint. Over
`apps/+(web|admin|preview)/src/**/*.{ts,tsx}`, 26 seconds:

```
Successfully compiled 1220 out of 1220 components.
StrictMode usage found.
Found no usage of incompatible libraries.
```

TypeScript and JSX parse fine, and both generated route trees
(`apps/web/src/routeTree.gen.ts`, 2,915 lines, and `apps/admin/src/routeTree.gen.ts`,
333 lines) parse without error.

The number is wrong. My own logger over almost the same corpus finds 93
`CompileError` events in 55 files. The healthcheck reports zero failures because
it cannot read the current severity model. Its
[`src/checks/reactCompiler.ts`](https://github.com/facebook/react/blob/main/compiler/packages/react-compiler-healthcheck/src/checks/reactCompiler.ts),
shipped verbatim in the published tarball, does this:

```ts
function isActionableDiagnostic(detail: CompilerErrorDetailOptions) {
  switch (detail.severity) {
    case ErrorSeverity.InvalidReact:
    case ErrorSeverity.InvalidJS:
      return true;
    case ErrorSeverity.InvalidConfig:
    case ErrorSeverity.Invariant:
    case ErrorSeverity.CannotPreserveMemoization:
    case ErrorSeverity.Todo:
      return false;
    default:
      throw new Error(`Unhandled error severity \`${detail.severity}\``);
  }
}
```

`ErrorSeverity` no longer has any of those members. It is `Error`, `Warning`,
`Hint`, `Off`. So every `CompileError` event hits `default` and throws, from
inside `logEvent`, which is called during the Babel transform. The transform
call sits in:

```ts
function compile(sourceCode: string, filename: string) {
  try {
    runBabelPluginReactCompiler(sourceCode, filename, 'typescript', COMPILER_OPTIONS);
  } catch {}
}
```

The bare `catch {}` swallows it. It also runs with
`panicThreshold: 'critical_errors'`, so the first real error aborts the file
anyway. The two together mean a file with any bail-out contributes nothing to
either the numerator or the denominator.

Measured on the four-violation probe file:

```
Successfully compiled 0 out of 0 components.
```

Four broken components, reported as zero out of zero. That is the failure mode
to care about, because it looks exactly like a clean run, which is the same
shape as the silent-pass problem the `MINIMUM_` floors in this repo exist for.

### Parsing its output

Even fixed, its output is one green line, `Successfully compiled N out of M
components.`, plus two lines from the other two checks. There is no file list,
no JSON, no exit code that varies, and no flag to add one. Issue #29078 asked
for a file list and was closed as not planned. So it cannot satisfy #652's
acceptance criterion regardless of the severity bug.

## Measured numbers for this repo

`compilationMode: 'infer'`, `panicThreshold: 'none'`,
`babel-plugin-react-compiler@1.0.0`, all `.ts` and `.tsx` under the named roots,
`node_modules` and `dist` skipped, suites included.

| corpus | modules | `CompileSuccess` | `CompileError` | files with an error | seconds |
| --- | --- | --- | --- | --- | --- |
| `apps/web`, `apps/admin`, `apps/preview` | 940 | 1,292 | 93 | 55 | 26 |
| the same plus `packages/ui-web` | 1,102 | 1,685 | 102 | 58 | 34 |

Zero parse failures and zero throws past the logger in both runs.

Bail-outs by `ErrorCategory` across the three apps: `Refs` 43, `Todo` 40,
`PreserveManualMemo` 3, `Hooks` 3, `Immutability` 3, `IncompatibleLibrary` 1.
The two that dominate are worth reading before planning the migration. `Refs` is
reading or writing a ref during render, and much of it is in the map directory,
where a Mapbox instance is held in a ref by design. `Todo` is the compiler
saying it has not implemented something, not a rule violation, so it moves on
version bumps without anybody editing a component.

The same 940 modules in `annotation` mode produce zero events in 6 seconds,
which is the measured form of "annotation mode cannot count this". There are
currently no `use memo`, `use no memo`, `use forget` or `use no forget`
directives anywhere in `apps/web/src`, `apps/admin/src`, `apps/preview/src` or
`packages/ui-web/src`.

## Can a bail-out be a build failure

Two separate mechanisms, and only the second belongs in this rollout.

**In the build.** `panicThreshold: 'all_errors'` makes the compiler throw, which
fails the Vite build. Do not use it during an `annotation`-mode rollout. It is
whole-repo, not per-file, so it would fail the build on a bail-out in a module
nobody has opted in yet, and react.dev recommends `'none'` for production for
exactly that reason. It also hides findings, per the table above.

**In CI, as a gate.** This is the right shape and it is the house shape. A
`scripts/check-*.mjs` that runs the compiler with `panicThreshold: 'none'`,
collects the events and compares against a checked-in expectation. It fails a
branch that adds a bail-out without also adding a directive and a reason, and it
never touches what the build emits. The rollout stays `annotation` mode and most
files stay uncompiled, which the gate treats as a third state rather than as a
failure.

The acceptance criterion in #652 is "every component either compiles or carries
a deliberate opt-out with a stated reason", and that is two assertions the gate
can make separately:

1. Every `CompileSkip` in the `infer` run has a stated reason. The compiler does
   not carry one, so the reason is a comment on the line above the directive, in
   the marker shape the four style gates already use. `readMarker` in
   `scripts/lib/style-gate.mjs` is that parse, and it already enforces the two
   rules a marker needs: the reason ends in a full stop, and a marker that
   excuses nothing fails.
2. The set of files holding a `CompileError` is the checked-in list and no
   larger. Ratcheted at 58, not gated at zero, for the reason `CLAUDE.md` gives
   for `UNCHECKED_ACKNOWLEDGEMENTS` and `UNCOVERED_MODULES`: a zero gate would
   fail every branch on history.

## The smallest gate that does it

I read `scripts/check-tileset-keys.mjs`, `scripts/check-map-palette.mjs`,
`scripts/lib/source-files.mjs` and `scripts/lib/style-gate.mjs` for the shape.
The convention is a docblock header carrying the mechanism and the incident,
`MINIMUM_` constants with a paragraph each explaining which silent pass they
catch, a failure list printed as `  - ` bullets, `process.exitCode = 1`, and a
one-line summary on success naming the counts. `sourceFiles` and
`typeScriptFilesUnder` in `scripts/lib/source-files.mjs` already do the walk,
with `{ tests: true }` when suites are in the corpus.

Sketch, matching that shape:

```js
const MINIMUM_MODULES = 850;          // the walk still reaches the apps
const MINIMUM_COMPILED_FUNCTIONS = 1100; // the plugin still ran on them
const BAILING_FILES = [ /* 58 paths, one per line */ ];
```

Three floors and not two would be better, and the middle one is the one this
gate specifically owes. A walk that has stopped finding files reports zero
bail-outs, and so does a plugin that loaded but silently compiled nothing,
and so does a corpus that parses but whose `logEvent` is never wired. So:
`MINIMUM_MODULES` against the walk, `MINIMUM_COMPILED_FUNCTIONS` against a run
that found the files and logged no successes, and asserting that the run
produced zero `CompileUnexpectedThrow` and zero parse failures, since either one
means a module was never analysed and its bail-outs are missing rather than
absent.

Cost is 34 seconds and one dependency, `babel-plugin-react-compiler` plus
`@babel/core` and `@babel/parser` at the workspace root. That is in line with
the other `verify` steps.

The list is 58 paths, which is large for a checked-in array but is the same
order as `UNCOVERED_MODULES` at 62 in `check-preview-coverage.mjs`, so it has a
precedent here. Grouping by `ErrorCategory` in the failure message is worth
doing, because `Todo` and `Refs` are different conversations.

One thing the gate cannot see, and the header should say so: it counts functions
the compiler *tried* to compile in `infer` mode, which is not the set of
functions the app renders. A component the heuristic does not recognise as a
component is silently outside the corpus, and nothing in the source states which
those are.

## Stability across versions

The number will churn on a version bump, and the event union has already moved
in the ten months between the two published artifacts.

`ErrorSeverity`, measured from published `.d.ts` files:

| version | members |
| --- | --- |
| `19.1.0-rc.3` | `InvalidJS`, `UnsupportedJS`, `InvalidReact`, `InvalidConfig`, `CannotPreserveMemoization`, `Todo`, `Invariant` |
| `1.0.0` and `main` | `Error`, `Warning`, `Hint`, `Off` |

`ErrorCategory` with its 26 members is new alongside that change, and it is what
carries the information the old severity enum carried. The rewrite is the whole
reason the healthcheck now reports zero failures, so this is not a hypothetical
churn risk. It has already broken one tool that read the field.

`LoggerEvent` membership, same method:

| version | members |
| --- | --- |
| `19.1.0-rc.3` and `1.0.0` | 8, including `AutoDepsDecorationsEvent` and `AutoDepsEligibleEvent`, no `CompileUnexpectedThrowEvent` |
| `main` today | 7, including `CompileUnexpectedThrowEvent`, neither `AutoDeps` event |

So two kinds left and one arrived between `1.0.0` and `main`. A gate that
switches exhaustively on `event.kind` and throws on an unknown one would break
on the next bump, which is the same defect as the healthcheck's. Switch on the
three kinds you care about and ignore the rest.

The bail-out *count* is less stable still, because `Todo` is 40 of the 93
findings in the apps. `Todo` means the compiler has not implemented a case yet,
so those disappear as the compiler improves, with no edit to any component. A
version bump will lower the number, and the gate has to be re-ratcheted downward
after one. That is the same operation as `pnpm fallow:baseline` and carries the
same risk, so the header should say to read the diff rather than just re-save.

Pin the compiler version exactly in `package.json`, the way `apps/web` already
pins `@tanstack/router-plugin` and `recharts`. A caret range would move the
number under a `pnpm install` with no commit to point at.

## What I could not confirm

- Whether the React team intends to deprecate `react-compiler-healthcheck`. The
  only source I found is a search-result summary. Nothing in the npm metadata,
  the package README, or issue #29078 says it.
- Whether `19.1.0-rc.3`'s `AutoDeps` events were removed from `main` or renamed.
  I compared two artifacts and did not read the commit that changed them.
- Whether `@vitejs/plugin-react@6` passes a `logger` through cleanly. The gate
  proposed here does not need it, since it drives Babel itself, so I did not
  test the Vite path.
- The healthcheck's behaviour with a `babel.config.js` present. Issue
  [#29135](https://github.com/facebook/react/issues/29135) reports it matching
  zero files in that case. This workspace has none at the root, and my run
  passed `configFile: false`, so I did not reproduce it.
