# What the TypeScript region predicate is built on

Status: Current, and about work that is not built.

> Its recommendation was adopted into `docs/region-membership-spec.md` under
> "Mobile": hand-roll the predicate in `packages/mapping` with
> `robust-predicates` as the one runtime dependency, because that agrees with
> `geometryContainsLngLat` by construction rather than by argument. The spec
> compresses the comparison to the three libraries it rules out. This is the full
> version, including the ones it does not mention. Mobile's TypeScript half is
> still specced and unbuilt, so nothing here has been contradicted by code yet.
> The Hermes claim has a shelf life: it rests on `facebook/hermes` issue #429
> being open and React Native release notes through 0.87 containing no "wasm".
> The check is one line on a device, `typeof global.WebAssembly`.

Research for [#266](https://github.com/thebigthing313/simmer-mosquito/issues/266),
part of [#242](https://github.com/thebigthing313/simmer-mosquito/issues/242).
Checked in August 2026. Every version number, size and date below was read from
the npm registry, the published tarball, or the project's own repository, and
the URL is given. Where I could not verify a claim I say so.

## The question

Decision 8 on the map commits to two implementations of "which regions contain
this record". The SQL half is shipped. The TypeScript half is for the mobile
app's offline answer, and the corpus in
[#246](https://github.com/thebigthing313/simmer-mosquito/issues/246) fixes what
it has to reproduce:

- Point against a polygon with holes, `st_intersects`.
- Line against a polygon with holes, `st_intersects`.
- Polygon against a polygon with holes, `region.geom && record.geom AND
  st_relate(region.geom, record.geom, 'T********')`. Interiors intersect, so
  boundary-only contact does not count.

`packages/mapping` has zero runtime dependencies today. The TypeScript half is
either hand-rolled or that package's first dependency.

## Summary

| Candidate | DE-9IM? | Interiors-intersect for area vs area | Runs under Hermes | Size (gzip) | Licence | Last release |
| --- | --- | --- | --- | --- | --- | --- |
| jsts | yes, `RelateOp` + `IntersectionMatrix` | direct | yes, pure JS | 107.3 KB whole bundle | EDL-1.0 OR EPL-1.0 | 2.12.1, 2024-11-16 |
| @flatten-js/core | yes, `relate()` returns a `DE9IM` | direct for polygon vs polygon only | yes, pure JS | 56.0 KB (`main.mjs`) | MIT | 1.6.14, 2026-08-18 |
| geos.js | yes, `relate` and `relatePattern` | direct | **no**, WebAssembly | 327 KB wasm + 490 KB wrapper | MIT OR LGPL-2.1-only | 0.1.5, 2025-09-08 |
| geos-wasm | GEOS C API, so yes | direct | **no**, WebAssembly | 757.8 KB | LGPL-3.0-or-later | 3.1.1, 2024-12-09 |
| turf `@turf/boolean-*` | no, named predicates only | compose, and the composition is wrong | yes, pure JS | ~1 KB per predicate | MIT | 7.4.0, 2026-08-03 |
| polygon-clipping | no, boolean ops only | compose from an area result | yes, pure JS | 13.9 KB | MIT | 0.15.7, 2023-12-18 |
| martinez-polygon-clipping | no, boolean ops only | compose from an area result | yes, pure JS | 3.5 KB | MIT | 0.8.1, 2025-12-07 |
| sweepline-intersections | no, self-intersection only | no | yes, pure JS | not measured | MIT | 2.0.1, 2024-11-24 |

Sizes are the whole published bundle gzipped, measured by fetching the file from
unpkg and running it through `zlib.gzipSync`. They are not tree-shaken figures.
What a bundler keeps after tree-shaking a deep import is unverified.

## 1. Which libraries expose DE-9IM

### jsts: yes, and it is the same algorithm PostGIS runs

jsts is a port of JTS. GEOS, which is what PostGIS calls for `ST_Relate`, is
also a port of JTS. So jsts's relate is not an independent reimplementation that
happens to agree, it is the same lineage.

The published tarball contains
`org/locationtech/jts/operation/relate/RelateOp.js` and the whole
`operation/relate/` tree (`RelateComputer`, `RelateNodeGraph`,
`EdgeEndBundleStar`), listed at
<https://unpkg.com/jsts@2.12.1/?meta>. `RelateOp.relate(a, b)` returns an
`IntersectionMatrix`, and `IntersectionMatrix.matches(pattern)` takes the same
nine-character pattern string the SQL side passes. Grepping
`dist/jsts.min.js` for `IntersectionMatrix` shows the named predicates
(`overlaps`, `disjoint`, `intersects`, `touches`) are all thin wrappers over
`getIntersectionMatrix()`, which is the general machinery being there.

Two mechanical notes on the package, read from
<https://registry.npmjs.org/jsts>:

- `"type": "module"`, and there is **no `main` and no `exports` field**. The only
  root-level files packed are `hasInterface.js`, `package.json` and `README.md`.
  There is no root `index.js`. So `import { ... } from 'jsts'` has nothing to
  resolve to and a consumer imports either `jsts/dist/jsts.min.js` or a deep ESM
  path such as `jsts/org/locationtech/jts/operation/relate/RelateOp.js`. Metro
  falls back to `index.js` when `main` is absent, which does not exist here, so
  the deep path is required. I did not run this under Metro, so treat the
  consequence as inference from the published file list, not a tested result.
- The only runtime dependency is `fastpriorityqueue@^0.7.5`, which is pure JS.

### @flatten-js/core: yes, but not for the shapes we have

`index.d.ts` at <https://unpkg.com/@flatten-js/core@1.6.14/index.d.ts> declares
`function relate(shape1: AnyShape, shape2: AnyShape): DE9IM` and a `DE9IM` class
with `I2I`, `I2B`, `I2E`, `B2I`, `B2B`, `B2E`, `E2I`, `E2B`, `E2E` accessors and
a `toString()`. Interiors-intersect is `denim.I2I.length > 0`, which is as direct
as it gets.

The dispatcher in `dist/main.mjs` routes to `relatePolygon2Polygon` for
Polygon vs Polygon, and that function computes `I2I` from a real polygon boolean
intersection, so the area-versus-area rule is genuinely there. Two gaps:

- **The dispatcher has no Point branch and no polyline branch.** It handles
  `Line` (an infinite line, not a segment), `Segment`, `Arc`, `Circle`, `Box`
  and `Polygon`. A GeoJSON `Point` against a `Polygon` returns `undefined`, and a
  multi-segment `LineString` has to be decomposed into `Segment`s whose nine
  matrices you then have to combine yourself. Combining DE-9IM matrices across a
  decomposition is not a union of the cells, so two of the three record
  dimensions need composition anyway.
- **`DP_TOL = 0.000001`**, a global tolerance in `dist/main.mjs`. In degrees that
  is roughly 11 cm on the ground. The existing `geometryContainsLngLat` uses
  `1e-12`. Two client-side answers inside one app would disagree on anything
  within 11 cm of a boundary. The corpus in #246 uses shared literal
  coordinates, so the corpus would not catch it, and agency-drawn geometry
  would.

### geos.js and geos-wasm: yes, and they are the exact semantics

`geos.js@0.1.5` declares `relate(a, b): string` and
`relatePattern(a, b, pattern): boolean` in
<https://unpkg.com/geos.js@0.1.5/dist/esm/index.d.mts>. That is `ST_Relate` with
the pattern argument, literally the same GEOS code PostGIS calls. It is the best
possible answer for agreement and the worst for the runtime. See section 2.

### turf: named predicates only, and the obvious composition is wrong

There is no `relate` anywhere in turf. The composition that looks right is
`booleanIntersects(a, b) && !booleanTouches(a, b)`: `ST_Touches` is boundaries
meet and interiors do not, so intersects-and-not-touches is interiors-intersect.
The algebra holds. turf's implementation does not.

Reading `@turf/boolean-touches@7.4.0/dist/esm/index.js`, the Polygon vs Polygon
branch is:

```js
case "Polygon":
  var foundTouchingPoint = false;
  for (var i = 0; i < geom1.coordinates[0].length; i++) {
    if (!foundTouchingPoint) {
      if (booleanPointOnLine(
        { type: "Point", coordinates: geom1.coordinates[0][i] },
        { type: "LineString", coordinates: geom2.coordinates[0] }
      ))
        foundTouchingPoint = true;
    }
    if (booleanPointInPolygon(
      { type: "Point", coordinates: geom1.coordinates[0][i] },
      geom2,
      { ignoreBoundary: true }
    ))
      return false;
  }
  return foundTouchingPoint;
```

That is vertex sampling on the outer rings. It indexes `coordinates[0]` on both
sides, so **holes are invisible to it**: a record polygon that shares only a
hole's edge with the region is not seen as touching. And a polygon whose
interiors genuinely overlap the region while none of its vertices land strictly
inside, which happens when the overlap is entered through a shared edge or a
vertex, comes back `true` for touches, so the composed predicate answers false
where PostGIS answers true. That is a wrong membership answer, not a rounding
difference, and it lands on exactly the corpus cases #246 flags as the ones most
likely to disagree.

`booleanIntersects` is `!booleanDisjoint`, and `booleanDisjoint`'s Polygon vs
Polygon path is `isPolyInPoly`, which is the same shape of vertex sampling plus a
`lineIntersect` call. It is fine for a coarse "do these touch at all" and is not
a topology computation.

### polygon-clipping, martinez-polygon-clipping, sweepline-intersections

None expose a predicate at all.

- `polygon-clipping@0.15.7` and `martinez-polygon-clipping@0.8.1` do boolean
  overlay: intersection, union, difference, xor. You can derive
  interiors-intersect from "the intersection result has at least one ring with
  non-zero area", which is what `@flatten-js/core` does internally. That is a
  real route and it costs you the area test plus a decision about what counts as
  non-zero, which is the same numeric cliff hand-rolling has. Both depend on
  `robust-predicates`, so the underlying arithmetic is exact.
- `sweepline-intersections@2.0.1` detects whether a polygon self-intersects. It
  is not a predicate library. Its published `dependencies` field lists
  `@rollup/plugin-commonjs`, `ava` and `vitest` alongside `tinyqueue`, which is a
  packaging mistake in the manifest, read from
  <https://registry.npmjs.org/sweepline-intersections>. Ruled out.

## 2. Cost of the ones that work, and the Hermes question

### WebAssembly under Hermes

This is decisive for geos.js and geos-wasm, and the public record is muddy, so I
checked primary sources rather than blog posts.

What I found:

- `facebook/hermes` issue [#429](https://github.com/facebook/hermes/issues/429),
  "WASM support within Hermes?", is **still open**, has no linked PR, and was
  last updated 2025-02-11. The maintainer's substantive answer in the thread is
  that Hermes has "initial support for Wasm encoded as Asm.js", requiring a
  custom build with the `HERMES_RUN_WASM` flag which "is disabled in the default
  build", and describes it as "very early, highly experimental, and definitely
  unsupported".
- `lib/VM/JSLib/` on `facebook/hermes` main contains no `WebAssembly.cpp`. The
  host objects there are `Array`, `ArrayBuffer`, `BigInt`, `DataView`, `Intl`,
  `JSON`, `Proxy`, `Reflect`, `TypedArray` and the rest of the standard set. No
  `WebAssembly` global is defined.
- A GitHub code search over `facebook/hermes` for "WebAssembly" returns only
  three kinds of hit: Static Hermes compiling JavaScript **to** Wasm
  (`doc/blog/2024-12-23-compiling-javascript-to-wasm.md`), Hermes itself being
  sandboxed inside a wasm2c runtime (`API/hermes_sandbox/`), and LLVM's own
  `IntrinsicsWebAssembly.td`. None of those is a Wasm VM inside the JS engine.
- Every React Native release body from 0.84 through 0.87, fetched with
  `gh api repos/facebook/react-native/releases --paginate`, contains **zero**
  occurrences of "wasm" or "WebAssembly". <https://reactnative.dev/docs/hermes>
  does not mention it either, and neither does the 0.84 release blog post.

Against that, one vendor blog, Callstack's "React Native 0.84: Hermes v1,
WebAssembly, and Ecosystem Shifts", is the single source claiming WebAssembly
ships in 0.84, and it is the source every search-result summary is repeating.
The page itself returns HTTP 403 to a fetch, so I could not read its wording.
The most likely reading is that it conflates "Static Hermes can compile
JavaScript to Wasm" with "Hermes can run Wasm". Those are opposite directions.

**Conclusion: Hermes exposes no `WebAssembly` global.** Anything requiring one
needs a native module. The two that exist are
`cawfree/react-native-webassembly`, a JSI TurboModule wrapping the Wasm3
interpreter, last pushed 2023-11-03 with 16 open issues, and
`inokawa/react-native-wasm`, which runs the module inside a hidden WebView and
marshals calls across the bridge. Neither is something to hang a correctness
guarantee on, and the WebView one would make every predicate call asynchronous
and cross-bridge.

So **geos.js and geos-wasm are out**, and with them the option of running
literally the same GEOS code on both sides. That is the single most useful
finding here, because it was the option that would have made agreement free.

### jsts

- **Size**: `dist/jsts.min.js` is 488.3 KB raw, **107.3 KB gzip**, measured by
  fetching <https://unpkg.com/jsts@2.12.1/dist/jsts.min.js>. That is the whole
  library. A deep ESM import of `RelateOp` pulls the `geomgraph` and `noding`
  trees behind it; how much a bundler drops is unverified. Unpacked tarball is
  3.7 MB across 983 files.
- **Licence**: `(EDL-1.0 OR EPL-1.0)`. EDL is BSD-3-Clause under another name, so
  the permissive branch is available and there is no copyleft obligation if you
  take it. GitHub's licence detector reports `NOASSERTION` for the repo, which is
  just the dual expression confusing it.
- **Maintenance**: 2.12.1 published 2024-11-16, repo last pushed 2025-01-02,
  1562 stars, 9 open issues, one maintainer. Quiet rather than abandoned. It is a
  port of a stable upstream, so quiet is closer to finished than to rotting.
- **React Native**: pure JavaScript, one pure-JS dependency, no Node builtins, no
  `eval`. It runs under Hermes. The `main`/`exports` gap in section 1 is the
  friction, and a deep import path resolves it.
- **Agreement with SQL**: the best available, because it is JTS and PostGIS runs
  a JTS port.

### @flatten-js/core

- **Size**: `dist/main.mjs` is 300.0 KB raw, **56.0 KB gzip**. The UMD build is
  57.5 KB gzip.
- **Licence**: MIT.
- **Maintenance**: 1.6.14 published 2026-08-18, repo pushed the same day, 651
  stars, 13 open issues. Actively maintained, and the most actively maintained of
  the DE-9IM candidates.
- **React Native**: pure JS, one dependency (`@flatten-js/interval-tree`), no
  Node builtins. It runs under Hermes.
- **Agreement with SQL**: worse than jsts. It is an independent implementation
  with a 1e-6 global tolerance, and the Point and LineString branches do not
  exist, so you would be composing two thirds of the answer yourself and
  inheriting the tolerance on the third.

### turf

Small, MIT, actively released, and it runs anywhere. It is disqualified on
correctness for the area case, not on cost. `@turf/boolean-point-in-polygon` is
worth keeping in mind on its own merits, see section 4.

## 3. What hand-rolling costs

Scope, given that the region side is always a single `geometry(Polygon, 4326)`
with optional holes and multipart geometry cannot occur on either side (#243):

**Point vs polygon: already done.** `geometryContainsLngLat` in
`packages/mapping/src/geometry.ts` is about 75 lines including
`polygonContainsLngLat`, `isInsideRing`, `isOnRing` and `isOnSegment`. Zero new
code.

**Line vs polygon (`st_intersects`): about 60 to 90 lines.** True if any line
vertex is inside-or-on the polygon, or any line segment meets any ring segment.
The vertex test reuses `polygonContainsLngLat`. The new part is
segment-to-segment intersection, and that is where the first hard case lives:
two collinear overlapping segments have a zero cross product for the whole
overlap, so the sign test that answers "do these cross" says nothing and you
need a separate collinear branch that projects onto the dominant axis and
compares intervals. The corpus case "running along an edge and nowhere else"
lands squarely on it.

**Polygon vs polygon with the interiors-intersect rule: about 180 to 350
lines**, and this is where the estimate is least trustworthy. The shape that
avoids a full overlay is:

1. If any ring segment of the record properly crosses any ring segment of the
   region, meaning they meet at a point interior to both segments, interiors
   intersect. Return true.
2. Otherwise the boundaries only touch or are disjoint, so one polygon is inside
   the other or they are apart. Pick a point strictly interior to the record and
   test it against the region's interior, then the reverse.

Three places that are genuinely hard, in the order they will bite:

- **Vertex-touching.** Step 1 requires a *proper* crossing. Two polygons that
  overlap by entering through a shared vertex have no proper crossing anywhere,
  so step 1 says no and step 2 has to catch it. Two polygons that merely kiss at
  a vertex also have no proper crossing, and step 2 has to *not* catch it. Those
  two cases differ only in the cyclic order of the four edges around the shared
  vertex, so you end up writing an angular sort at every shared vertex. The
  corpus's "shares one vertex only" and "shares one edge only" cases are the pair
  that separates a correct implementation from one that looks correct.
- **Collinear overlapping segments.** Same cliff as the line case, worse, because
  a shared edge means the boundary walk has to decide which side of the shared
  edge each polygon's interior lies on before it can say whether the interiors
  meet beyond it.
- **The representative interior point.** Step 2 needs a point *strictly* inside
  the record polygon. The centroid is not it: a concave polygon or one with a
  hole can put its centroid outside, or inside a hole. PostGIS has
  `ST_PointOnSurface` for exactly this. Rolling your own means a
  ray-through-the-polygon scan picking the midpoint of the widest interior span,
  which is another 40 to 60 lines and has its own degenerate cases when the ray
  grazes a vertex.

Under all three sits the same primitive: the sign of a 2x2 determinant. Computed
in doubles it is wrong near zero, and near zero is precisely where every case
above lives. `robust-predicates` gives an exact `orient2d`: Unlicense, so public
domain, zero dependencies, pure JS, `esm/orient2d.js` is 5.3 KB raw and **1.0 KB
gzip**, latest 3.0.3 published 2026-03-22. Both `polygon-clipping` and
`point-in-polygon-hao` already depend on it. Taking it costs almost nothing and
removes the largest source of silent wrong answers.

**Total: roughly 250 to 450 new lines** plus the existing 75, plus
`robust-predicates` as a 1 KB dependency. That is smaller than it sounds and
riskier than it sounds. The corpus is twenty-two cases. Agency-drawn polygons
are not the corpus, and the failure mode of a hand-rolled overlay is a wrong
boolean on one record with nothing to make it visible.

## 4. Agreement with the existing boundary behaviour

`geometryContainsLngLat` treats a hole's edge as inside. The comment in
`polygonContainsLngLat` says so directly: "A hole's edge is still the polygon's
boundary, so it stays inside." Outer-ring edges are inside too, matching
`ST_Intersects`. The edge test is `isOnSegment` with a cross-product tolerance of
`1e-12` degrees.

Where each candidate lands:

- **jsts**: agrees. JTS treats a hole's boundary as part of the polygon's
  boundary, and `ST_Intersects` is true when boundaries meet, so a point on a
  hole's edge intersects. Same answer, and it is the same answer PostGIS gives.
  I did not execute this, so it is reasoning from the shared JTS lineage rather
  than a run.
- **turf `booleanPointInPolygon`**: agrees. It delegates to
  `point-in-polygon-hao`, which returns `0` for a boundary hit on any ring, and
  turf maps `0` to true when `ignoreBoundary` is false, which is the default.
  Read from
  <https://unpkg.com/@turf/boolean-point-in-polygon@7.4.0/dist/esm/index.js>.
  Hao's algorithm uses `robust-predicates`, so its boundary test is exact rather
  than epsilon-based. On the corpus, whose boundary cases are built from
  coordinates that appear literally in the region ring, exact and 1e-12 give the
  same answer. Off the corpus they differ within 1e-12 degrees, which is under a
  micron and not worth caring about.
- **@flatten-js/core**: disagrees in practice. Its `relate` has no Point branch,
  so the comparison is not even direct, and its 1e-6 global tolerance is six
  orders of magnitude looser than `geometryContainsLngLat`'s. Two client-side
  membership answers in one app, differing on anything within about 11 cm of a
  boundary. That is a real distance for a habitat drawn along a district line.
- **A hand-rolled implementation**: agrees by construction, because it extends the
  code that defines the behaviour. This is the strongest argument for
  hand-rolling and it is worth naming as one: there is exactly one place where
  "does a hole's edge count" is decided, and every dimension reads it.
- **geos.js / geos-wasm**: would agree exactly, being GEOS. Unreachable.

## 5. Bottom line: does decision 8 survive?

**Yes.** The offline answer is reachable under React Native's constraints. It is
not reachable the easy way.

What died: running the same GEOS code on both sides. Hermes has no `WebAssembly`
global, the open Hermes issue is five years old with no implementation, and the
only React Native Wasm bridges are an unmaintained JSI wrapper around Wasm3 and a
WebView marshalling hack. The one blog claiming Wasm shipped in React Native 0.84
is contradicted by the release notes, the Hermes source tree, and the Hermes docs.
If someone cites it, the check is one line: `typeof global.WebAssembly` on a
device.

What survives, in order:

1. **Hand-roll in `packages/mapping`, with `robust-predicates` as the one runtime
   dependency.** Roughly 250 to 450 new lines on top of the existing 75. It is
   the only option that agrees with `geometryContainsLngLat` by construction
   rather than by argument, it keeps the package near-dependency-free at about
   1 KB gzip, and the corpus exists precisely to hold it to PostGIS. The cost is
   that the polygon-versus-polygon case is real computational geometry and the
   three hard parts in section 3 are where a wrong boolean will hide.
2. **Add `jsts` as a devDependency oracle for the corpus test**, whichever way
   option 1 goes. 107 KB gzip is too much to ship for one predicate, but as a
   test-only third voice it is free, and it is the same JTS lineage PostGIS runs.
   The corpus expectations are hand-written by decision 9 in #246, and a
   hand-written expectation plus a hand-rolled implementation is one pair of eyes
   checking itself. jsts breaks that tie without shipping anything.
3. **Fall back to `jsts` at runtime** if the hand-rolled area case proves
   unstable against real agency geometry. It runs under Hermes, its licence has a
   permissive branch, and the deep import path works around the missing `main`
   field. Pay the 107 KB then, with evidence, not now on a guess.

`@flatten-js/core` is the one to say no to explicitly, because it looks like the
answer. It has a genuine DE-9IM, it is MIT, it is the best maintained of the lot,
and it is 56 KB. It also has no Point branch, no LineString branch, and a 1e-6
global tolerance that would give the app two different membership answers about
eleven centimetres apart. Turf is the other one to say no to: the
`intersects && !touches` composition is algebraically right and turf's
`booleanTouches` for polygon versus polygon is outer-ring vertex sampling that
ignores holes, so it returns wrong answers on the exact corpus cases #246 names
as the risky ones.

The spec does not need to retreat. It needs to say the offline answer is
hand-rolled, that `robust-predicates` is the dependency, and that the corpus is
the gate.

## Sources

- <https://registry.npmjs.org/jsts>, <https://unpkg.com/jsts@2.12.1/?meta>,
  <https://unpkg.com/jsts@2.12.1/dist/jsts.min.js>
- <https://registry.npmjs.org/@flatten-js/core>,
  <https://unpkg.com/@flatten-js/core@1.6.14/index.d.ts>,
  <https://unpkg.com/@flatten-js/core@1.6.14/dist/main.mjs>
- <https://registry.npmjs.org/geos.js>,
  <https://unpkg.com/geos.js@0.1.5/dist/esm/index.d.mts>
- <https://registry.npmjs.org/geos-wasm>
- <https://unpkg.com/@turf/boolean-touches@7.4.0/dist/esm/index.js>,
  <https://unpkg.com/@turf/boolean-disjoint@7.4.0/dist/esm/index.js>,
  <https://unpkg.com/@turf/boolean-point-in-polygon@7.4.0/dist/esm/index.js>
- <https://registry.npmjs.org/polygon-clipping>,
  <https://registry.npmjs.org/martinez-polygon-clipping>,
  <https://registry.npmjs.org/sweepline-intersections>
- <https://registry.npmjs.org/robust-predicates>,
  <https://unpkg.com/robust-predicates@3.0.3/esm/orient2d.js>
- <https://github.com/facebook/hermes/issues/429>,
  <https://github.com/facebook/hermes/tree/main/lib/VM/JSLib>,
  <https://reactnative.dev/docs/hermes>,
  <https://reactnative.dev/blog/2026/02/11/react-native-0.84>,
  `gh api repos/facebook/react-native/releases --paginate` for 0.84 to 0.87
- <https://github.com/cawfree/react-native-webassembly>,
  <https://github.com/inokawa/react-native-wasm>
- <https://www.callstack.com/events/react-native-0-84-and-other-news> (HTTP 403,
  not read directly; the Wasm claim is quoted from search-result summaries and is
  the one source I could not verify)
