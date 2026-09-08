# React Compiler hazard survey

Answers [#653](https://github.com/thebigthing313/simmer-mosquito/issues/653).
This is the input to the phase plan
([#656](https://github.com/thebigthing313/simmer-mosquito/issues/656)) and to
the bail-out gate
([#777](https://github.com/thebigthing313/simmer-mosquito/issues/777)). It ranks
risk. It decides nothing.

Everything below was measured against this checkout on 2026-09-07 with
`babel-plugin-react-compiler@1.0.0`, installed into the scratchpad, not into the
workspace. No file in the repo was changed by the sweep. The method is the one
[#652](https://github.com/thebigthing313/simmer-mosquito/issues/652)
recommends: drive the Babel plugin directly with a `logger`, at
`compilationMode: 'infer'`, `panicThreshold: 'none'`, `noEmit: true`. Read that
issue before re-running any of this.

## Corpus

`apps/web/src`, `apps/admin/src` and `packages/ui-web/src`, every `.ts` and
`.tsx` that is not a `.d.ts`, suites included, `dist` and `node_modules`
skipped. 1,087 modules. `apps/preview` is out, which is the only difference from
#652's second row, and it accounts for 15 modules and zero bail-outs.

Two runs, on the same corpus:

- **The default run.** Plugin defaults. 1,674 `CompileSuccess`, 102
  `CompileError` in 58 files, zero `CompileSkip`, zero `CompileDiagnostic`, zero
  parse failures, zero throws past the logger. This is the "will not compile"
  half.
- **The strict run.** The same, plus the nine `environment` validations that are
  off by default: `validateNoSetStateInEffects`,
  `validateNoDerivedComputationsInEffects`, `validateStaticComponents`,
  `validateMemoizedEffectDependencies`, `validateNoImpureFunctionsInRender`,
  `validateNoFreezingKnownMutableFunctions`, `validateNoVoidUseMemo`,
  `validateNoDynamicallyCreatedComponentsOrHooks`,
  `validateNoJSXInTryStatements`. 137 findings, so 37 that the default run does
  not report. This is most of the "compiles but may misbehave" half, and it is
  how the numbers in
  [#651](https://github.com/thebigthing313/simmer-mosquito/issues/651) were
  produced without installing ESLint: `eslint-plugin-react-hooks` runs the same
  compiler with these validations on and maps each `ErrorCategory` to a rule
  name.

The strict run is the reason this survey has two halves that a single run cannot
separate. A finding in the default run stops the component compiling and is
loud. A finding only in the strict run does not: that component compiles today
and will keep compiling, and whatever the finding names is a behaviour the
compiler is now free to change.

## Headline

| project | bail-outs | files |
| --- | --- | --- |
| `apps/web` | 92 | 54 |
| `packages/ui-web` | 9 | 3 |
| `apps/admin` | 1 | 1 |

`apps/admin` is one finding away from clean and should be the first surface.
Two of the 58 files are suites.

## Part 1: will not compile

102 `CompileError` events, 58 files.

| `ErrorCategory` | count | files | needs an edit |
| --- | --- | --- | --- |
| `Refs` | 50 | 19 | yes |
| `Todo` | 42 | 29 | no, see below |
| `PreserveManualMemo` | 3 | 3 | yes |
| `Hooks` | 3 | 3 | yes |
| `Immutability` | 3 | 3 | yes |
| `IncompatibleLibrary` | 1 | 1 | probably not |

### `Todo` is 42 findings and one shape

40 of the 42 are try/catch, and 35 of those are a `finally` clause or a `try`
with no `catch`:

| reason | count |
| --- | --- |
| Handle `TryStatement` with a finalizer (`finally`) clause | 28 |
| Support value blocks within a `try`/`catch` statement | 5 |
| Handle `TryStatement` without a `catch` clause | 5 |
| Support `ThrowStatement` inside of `try`/`catch` | 2 |
| Handle tagged template where cooked value differs from raw | 2 |

The shape is the house submit handler, and `comments-section.tsx:236` is every
one of them: `setSubmitting(true)`, `try { await onSubmit() }`,
`catch { restore the draft }`, `finally { setSubmitting(false) }`. That is
correct code. `Todo` means the compiler has not implemented the case, not that
the code breaks a rule.

So this is 29 files that need no edit and will compile themselves on a compiler
version bump. It is also the single largest reason the bail-out count will move
without anybody touching a component, which is what makes a ratcheted gate over
the count something to re-read rather than re-save. Do not spend the phase plan
rewriting submit handlers to dodge it.

The two tagged-template findings are both in
`packages/ui-web/src/components/ui/calendar.tsx`, in generated shadcn source,
which `biome.json` already excludes from linting.

### `Refs` is 50 findings and two populations

19 files, all "Cannot access refs during render". Twelve of them are the map:

```
apps/web/src/components/map/use-map-draw.ts          9
apps/web/src/components/map/use-geojson-source.ts    6
apps/web/src/components/map/use-map-measure.ts       5
apps/web/src/components/map/use-route-layer.ts       4
apps/web/src/components/map/use-mapbox-map.ts        3
apps/web/src/components/map/use-address-point.ts     2
apps/web/src/components/map/use-tile-layer.ts        2
apps/web/src/components/map/use-geojson-layer.ts     1
apps/web/src/components/map/use-geolocation.ts       1
apps/web/src/components/map/map-canvas.tsx           1
apps/web/src/components/route-planning/route-map.tsx 1
apps/web/src/routes/operations/-worklist-map.tsx     1
```

These hold a Mapbox `Map` in a ref by design, and the ref access during render
is the design, not a slip. Read them as a group that gets one decision, not as
twelve edits. The remaining seven are ordinary and are separable:

```
packages/ui-web/src/components/app-shell/header/header-search-bar.tsx    6
apps/web/src/routes/larval-surveillance/inspections/table.tsx            3
apps/web/src/components/catalog/catalog-record-dialog.tsx                1
apps/web/src/routes/adult-surveillance/-collection-key-entry.tsx         1
apps/web/src/routes/gis/regions/index.tsx                                1
apps/web/src/routes/larval-surveillance/-sample-key-entry.tsx            1
packages/ui-web/src/components/form/field-components/metadata-field.tsx  1
```

`header-search-bar.tsx` at 6 findings on three lines is a small file and is the
whole of `packages/ui-web`'s ref problem apart from one field component.

### The five singletons worth reading individually

- `apps/web/src/components/explorer/use-paged-map-resource.ts:116`,
  `apps/web/src/components/explorer/use-region-membership.ts:58` and
  `apps/web/src/routes/public-engagement/service-requests/index.tsx:565`,
  `PreserveManualMemo`: existing memoization could not be preserved. **These are
  the highest-value findings in Part 1.** The compiler refuses rather than
  silently producing weaker memoization, and it refuses exactly where a
  hand-written `useMemo` is doing something the inference cannot reproduce. Each
  one is a place where the memo is load-bearing, so each is a question for the
  strip phase as much as for the compiler phase.
- `apps/web/src/routes/adult-surveillance/traps/routes/index.tsx:21` and
  `apps/web/src/routes/larval-surveillance/habitats/routes/index.tsx:21`,
  `Hooks`: "Hooks may not be referenced as normal values, they must be called."
  Two files, same line number, so this is one copied shape.
- `apps/web/src/components/route-planning/routes-index-page.tsx:82`, `Hooks`: a
  hook value that may change to a different function between renders.
- `apps/web/src/components/search/search-palette.tsx:80`, `Immutability`:
  `opening` is accessed before it is declared. The other two `Immutability`
  findings are both in suites,
  `tests/unit/components/explorer/explorer-map-page.test.tsx:425` and
  `tests/unit/components/map/fake-map.tsx:298`.
- `apps/web/src/components/explorer/result-list.tsx:187`,
  `IncompatibleLibrary`: a library API that returns unmemoizable functions. One
  finding, and the compiler's own lint rule rates this category `Warning` rather
  than `Error`.

## Part 2: compiles but may misbehave

37 findings the default run does not report. These components compile today.

| `ErrorCategory` | count | files |
| --- | --- | --- |
| `EffectSetState` | 28 | 26 |
| `ThrowDuringTransform` | 4 | 4 |
| `StaticComponents` | 2 | 2 |
| `EffectDependencies` | 1 | 1 |
| `EffectDerivationsOfState` | 1 | 1 |
| `Purity` | 1 | 1 |

### `EffectSetState`, 28 findings

`setState` called synchronously inside an effect, which triggers a cascading
render. Spread thin, one or two per file, across explorers, search, the map
readout, the region and stop-order drag surfaces, and four `packages/ui-web`
components. `apps/web/src/routes/search.tsx` has five, the most in any file.

This is the category to hold in mind while reading Part 3. The compiler does not
refuse these, so nothing stops them compiling, and once it owns the memoization
the number of renders that cascade is no longer the number a reader counts from
the source. A cascade that currently settles in two passes is not guaranteed to
settle in two passes afterwards.

#651 measured 33 of these with `eslint-plugin-react-hooks@7.1.1` where this run
measures 28. The rule name is the same. The analysis behind it moved between
`babel-plugin-react-compiler@1.0.0` and whatever v7.1.1 bundles, which is the
same version churn #652 documents for `ErrorSeverity` and `LoggerEvent`. Treat
any count in this section as version-bound.

### The other nine

- `apps/web/src/components/search/search-result-row.tsx:45` and
  `apps/web/src/routes/search.tsx:550`, `StaticComponents`: a component created
  during render. Resetting state on every render is the failure this names, and
  it is a real bug shape rather than a compiler nicety.
- `apps/web/src/components/map/map-search.tsx:75`, `EffectDependencies`: the
  effect dependencies could not be memoized, so the compiler skips optimizing
  the component. The same file also carries two `EffectSetState`. It is the most
  loaded single module in Part 2.
- `apps/web/src/routes/my-organization/-components/general.tsx:439`,
  `EffectDerivationsOfState`: a value derived from props and state is computed
  in an effect rather than during render.
- `packages/ui-web/src/components/ui/sidebar.tsx:589`, `Purity`: an impure
  function called during render.
- Four suites throw during the strict transform, all on
  `validateNoDynamicallyCreatedComponentsOrHooks`, because they declare a
  `Probe` or `Page` component inside the test body:
  `tests/unit/components/catalog/catalog.test.tsx`,
  `tests/unit/components/explorer/explorer-map-page.test.tsx`,
  `tests/unit/components/map/fake-map.tsx` and
  `tests/unit/components/map/map-canvas.lifecycle.test.tsx`. Whether the
  compiler pass runs under vitest at all is
  [#776](https://github.com/thebigthing313/simmer-mosquito/issues/776), and
  these four are the corpus that question decides the fate of.

### The six map modules that hold a ref and compile clean

This is the finding the ticket asked for and no tool reports. Seventeen modules
under `apps/web/src/components/map` call `useRef`. Eleven of them bail out, ten
on `Refs` and `geometry-import-dialog.tsx` on `Todo`, and are therefore safe:
the compiler will not touch them until somebody edits them.
**Six compile clean:**

```
apps/web/src/components/map/geolocate-control.tsx
apps/web/src/components/map/geometry-control.tsx
apps/web/src/components/map/map-search.tsx
apps/web/src/components/map/record-location-card.tsx
apps/web/src/components/map/use-map-extent-fit.ts
apps/web/src/components/map/use-map-padding.ts
```

They are the top of the risk list. A GL map has already proven fragile against
remount here: the map canvas needed an `isMapLive` guard rather than a null
check, because a Suspense hide destroys the map instance
([#132](https://github.com/thebigthing313/simmer-mosquito/issues/132)). These
six hold the same kind of mutable imperative object, pass the compiler's ref
check, and would be memoized silently. `map-search.tsx` is the worst of them,
carrying an `EffectDependencies` and two `EffectSetState` on top.

Nothing static can tell you whether memoizing them is wrong. That is a
render-behaviour question, so the phase plan should treat these six as the ones
that get browser verification rather than a review.

### `useLiveQuery` identity

58 files call both a live query and `useMemo`, holding 114 memos between them.
That is the population where "the memo is holding an identity that
`useLiveQuery` does not" could be true, and it is not a list of hazards: it is
the search space. Nothing in the source says which of the 114 are load-bearing.

Three of them are already named, because the compiler refuses them:
`use-paged-map-resource.ts`, `use-region-membership.ts` and
`service-requests/index.tsx` are the `PreserveManualMemo` findings from Part 1,
and all three read live queries. Start the strip phase there. If the compiler
cannot preserve those three, they are the memos most likely to be doing
something identity-shaped.

## Part 3: shapes checked and not found

Negative results, all from an AST scan of the same 1,087 modules. Each of these
was on the ticket as a suspected hazard and is not one here.

- **Effects with a deliberately incomplete dependency array: zero.** No
  `useEffect` or `useLayoutEffect` with an empty `[]` that references a binding
  from the enclosing component. There is also no ESLint in the repo, so there is
  no `eslint-disable` on `exhaustive-deps` anywhere, and nothing suppressing a
  deps warning that would need reading. #651 measured 12 `exhaustive-deps`
  findings at v7.1.1, which is a `warn` rule and not one this survey can
  reproduce without installing ESLint.
- **`useMemo` used as a run-once guard: zero.** No `useMemo` with a block body
  and no `return`.
- **`useMemo` used for a side effect: effectively zero.** The scan flagged 21
  and every one is a false positive on the same shape, a locally constructed
  `Map` being filled in a loop before it is returned. Four of the 21 return an
  object of setter callbacks, which is pure and is an identity question rather
  than a side-effect one: `-region-dnd.ts:102`, `-region-rename.ts:24`,
  `breadcrumb-labels.tsx:35` and `samples/$id.tsx:534`, if that distinction
  matters later.
- **`React.memo`: zero,** as #649 already records.
- **Render-time mutation of props, context values or module-level objects:** the
  compiler's own answer is the three `Immutability` findings in Part 1 and one
  `Purity` in Part 2, and only two of the four are in shipping source. There is
  no wider population.
- **Compiler directives: zero.** No `use memo`, `use no memo`, `use forget` or
  `use no forget` anywhere in the corpus, so the rollout starts from a clean
  sheet on annotation.

## Part 4: two corrections to the map

Both change how a later ticket is sized, so they are here rather than left for
somebody to rediscover.

**The memo count on #649 is a count of mentions, not of call sites.** The map
says "roughly 1,186 hand-written memoizations (632 `useCallback`, 554 `useMemo`,
across 254 files)". Counting the identifier, including the import specifier,
gives 637 and 548 across 244 files workspace-wide, which is where those numbers
came from. Counting the call gives **824 workspace-wide** and **821 in the three
projects this map covers**:

| project | `useCallback` | `useMemo` |
| --- | --- | --- |
| `apps/web/src` | 481 | 320 |
| `packages/ui-web/src` | 7 | 10 |
| `apps/admin/src` | 0 | 3 |
| `apps/preview/src` | 0 | 1 |
| `apps/mobile/src` | 2 | 0 |

242 files in the three in-scope projects hold at least one. The strip phase is
about 30% smaller than the map assumes, and it is almost entirely `apps/web`:
`apps/admin` has three memos and no callbacks at all.

**`packages/ui-web`'s `.` export is dead, and the split is not the hazard the
map describes.** #649's notes say the `.` subpath resolves to `dist/index.js`
built by `tsc -b`, which runs no compiler pass, while about 40 subpaths resolve
to raw `src`. Both halves are true and the conclusion does not follow, because
**`src/index.ts` is one line, `export * from './lib/utils'`**, and **no app
imports the bare specifier at all**. Measured: 0 imports of
`'@simmer-mosquito/ui-web'` against 1,043 subpath imports across web, admin and
preview, 67 distinct subpaths in web, 23 in admin, 18 in preview.

So every React component in `packages/ui-web` reaches an app as raw source and
is compiled by whichever app imports it. There is no uncompiled-`dist` problem
for components. The real consequence is the opposite one: **a shared component
is compiled once per consuming app, under that app's plugin config**, so a
`ui-web` component can be compiled in `apps/web` and not in `apps/admin`, and
#650's recommendation to leave `apps/preview` out of the wiring means the 18
subpaths preview imports stay uncompiled there. That is the same open question
the map already lists under **Not yet specified** for `apps/preview`, and this
is the mechanism behind it.

## Ranked risk list

Ordered by "how likely is this to produce a wrong screen that nothing catches",
not by count.

1. **The six ref-holding map modules that compile clean.** Silent, imperative,
   and this codebase has already been bitten once by GL map lifecycle. Needs
   browser verification, not review. `map-search.tsx` first.
2. **The three `PreserveManualMemo` findings.** The compiler is telling you
   exactly where a hand-written memo does something it cannot reproduce, and all
   three read live queries. They gate both phases.
3. **`EffectSetState`, 28 findings in 26 files.** Compiles, so nothing stops it,
   and the compiler owning memoization changes how the cascade settles.
   `routes/search.tsx` holds five.
4. **The two `StaticComponents` findings.** A component created during render
   resets state, which is a bug today and stays one.
5. **The 114 memos in the 58 files that read a live query.** A search space, not
   a list. Item 2 is where to start reading it.
6. **`Refs`, 50 findings in 19 files.** Loud, so it cannot ship wrong, but it is
   the largest edit in Part 1 and twelve of the nineteen files are one Mapbox
   decision.
7. **`Hooks` 3, `Immutability` 3, `IncompatibleLibrary` 1, `Purity` 1,
   `EffectDependencies` 1, `EffectDerivationsOfState` 1.** Individually read,
   individually decided. Two of the three `Immutability` are suites.
8. **`Todo`, 42 findings in 29 files.** Last, deliberately. No edit is correct
   here, and the number falls on a compiler bump with no commit to point at.

## What this survey cannot see

It counts functions the compiler tried to compile in `infer` mode, which is not
the set of functions the app renders. A component the heuristic does not
recognise as a component is silently outside the corpus, and nothing in the
source says which those are. That is #652's caveat and it applies unchanged
here.

It also says nothing about bundle size, which is on the map under **Not yet
specified** and which nothing has measured. The compiler's memo caches grow
output, and boot JS was fought down to 1072 KB in earlier work.
