# Native and WebView maps on low-end Android: what is published

Status: Current. Research only; nothing here is built and nothing here is a
decision.

Research for [Research: published experience of native and WebView maps on low-end Android](https://github.com/thebigthing313/simmer-mosquito/issues/1361),
which feeds [React Native or Capacitor for the field app on Android](https://github.com/thebigthing313/simmer-mosquito/issues/1358)
and [Benchmark the field app's budgets on a real phone](https://github.com/thebigthing313/simmer-mosquito/issues/1352).
Checked on 2026-10-02. I read GitHub issues on `maplibre/maplibre-gl-js`,
`maplibre/maplibre-react-native`, `maplibre/maplibre-native`, `rnmapbox/maps`,
`mapbox/mapbox-maps-android`, `mapbox/mapbox-gl-js`, `ionic-team/capacitor` and
`facebook/hermes`, Capacitor's Android source, the Android developer docs, and
the React Native release posts. Every source below carries the date it was
written. Two Medium posts that search results quote (a Walmart memory study and
an Ionic to React Native migration story) refused the fetch; where I use their
numbers I say I read them second hand.

The short answer to the user's question, "surely someone out there has had to
work this out before": people have hit every piece of this, but nobody I could
find has published the comparison itself. There is no same-device measurement of
a native map against a WebView map at tens of thousands of GeoJSON features on a
budget phone. What is published is a set of failure reports, maintainer advice,
and JavaScript engine microbenchmarks, and they narrow the benchmark rather than
replace it.

## Summary

- **No head-to-head exists.** I found no published frame rate, memory or
  feature-count threshold comparing `@rnmapbox/maps` or MapLibre React Native
  with MapLibre GL JS or Mapbox GL JS in an Android WebView, on any device, let
  alone a 4 GB one. Vendor comparisons exist on both sides and test neither maps
  nor low-end phones.
- **The native SDK does not escape the data-size problem.** A Mapbox Android
  maintainer told a team with 20,000 client-side GeoJSON points that the scale
  "needs to be solved differently" (vector tiles from a server); the reporter's
  lag on a Galaxy Tab A8 went away once they clustered
  ([mapbox-maps-android#1449](https://github.com/mapbox/mapbox-maps-android/issues/1449),
  2022). Both stacks tile GeoJSON with the same algorithms: MapLibre Native
  vendors `geojson-vt-cpp` and `supercluster`, the C++ ports of what MapLibre GL
  JS runs in a Web Worker. Clustering and a low source `maxzoom` are needed on
  either stack.
- **The documented WebView risk is renderer death, and Capacitor's default
  turns it into an app kill.** Android kills the WebView renderer process to
  reclaim memory, and if no `WebViewClient` returns `true` from
  `onRenderProcessGone`, WebView kills the app. Capacitor's
  `BridgeWebViewClient` returns `false` unless a plugin listener says otherwise.
  The fix is known and small. How often it fires on 3 to 4 GB phones is not
  published anywhere I could find.
- **Field-app shaped reports exist for renderer death.** A Capacitor user in
  2020 reported the WebView crashing "frequently" during photo capture plus a
  canvas resize, losing the photo; another in 2022 wrote that WebGL map libraries
  "can exacerbate it" and that his team was "held back" from them
  ([capacitor#2379](https://github.com/ionic-team/capacitor/issues/2379)).
  These are reports, not rates.
- **Hermes is an interpreter and loses to a JIT on steady-state compute.** A
  2024 report measured a tight array loop at 1,400 ms on Hermes against 100 ms in
  the Android WebView on a Redmi Note 9, and a Hermes maintainer called the gap
  expected ([hermes#1294](https://github.com/facebook/hermes/issues/1294)).
  `JSON.parse` was about 3x slower than JSC until a parser rewrite in November
  2025 brought it to about 1.5x ([hermes#811](https://github.com/facebook/hermes/issues/811)).
  Hermes V1, the default since React Native 0.84, still has no JIT. These are
  microbenchmarks, not TanStack DB workloads.
- **There is no V8 escape hatch on React Native any more in practice.**
  `react-native-v8` has had no push since 2024-08-20, and `apps/mobile` is on
  React Native 0.86.
- **Unpredictable phones include old WebViews.** On a Huawei phone with a
  Chromium 88 WebView, MapLibre GL JS 5.23 and later draw an empty canvas
  ([maplibre-gl-js#8157](https://github.com/maplibre/maplibre-gl-js/issues/8157),
  2026-08). Phones without Google Play do not get the Play-updated WebView.
- **No team I could find published a map-driven move** between Capacitor or
  Cordova and React Native with numbers.

## Native map against WebView map

### What was searched for and not found

The ticket asked for pan frame rate, the feature count where each stack
degrades, and clustering's effect, on a budget phone. I searched the issue
trackers of all six map projects and the general web. The closest things:

- A 2025 paper in ISPRS International Journal of Geo-Information, "Vector Data
  Rendering Performance Analysis of Open-Source Web Mapping Libraries"
  ([MDPI](https://www.mdpi.com/2220-9964/14/9/336)), compared Leaflet,
  OpenLayers, Mapbox GL JS and MapLibre GL JS on initial render time of GeoJSON.
  Its abstract says that at 50,000 features and up Mapbox GL JS rendered fastest,
  then OpenLayers, MapLibre GL JS and Leaflet. The publisher refused the fetch,
  so I could not check the hardware, and it measures first render, not panning.
  It says nothing about phones.
- Ionic's own "Ionic vs. React Native: Performance Comparison"
  ([ionic.io](https://ionic.io/blog/ionic-vs-react-native-performance-comparison),
  2022-03-23) ran on an iPhone 11 Pro Max and tested lists and transitions, not
  maps. It is vendor marketing and has no Android data.
- The Capawesome Capacitor MapLibre plugin announcement
  ([capawesome.io](https://capawesome.io/blog/announcing-the-capacitor-maplibre-plugin/),
  2026-09-25) claims native rendering is faster and gives no numbers.

### What native map users report

- [mapbox-maps-android#1449](https://github.com/mapbox/mapbox-maps-android/issues/1449),
  2022-06-22, Maps SDK 10.6.0, Galaxy S20+ and Galaxy Tab A8. Many GeoJSON
  points, unclustered, lagged on Android and not on iOS, heading for 20,000.
  Maintainer `tobrun`: "This amount of scale of 20000, needs to be solved
  differently", meaning server-side vector tiles. The reporter: clustering "has
  mostly fixed this problem". Measured: no. Video comparison only.
- [mapbox-maps-android#2006](https://github.com/mapbox/mapbox-maps-android/issues/2006),
  2023-02-13. A maintainer says SDK 10.11 stopped converting GeoJSON to a string
  before processing, which "improved the performance", and points to the
  `LargeGeojsonPerformanceActivity` example. No numbers.
- [rnmapbox/maps#3489](https://github.com/rnmapbox/maps/issues/3489),
  2024-05-13, `@rnmapbox/maps` 10.1.23. A data-driven `match` expression with
  more than 10,000 entries over an MVT source failed to render; 100,000 crashed
  the app. Closed without a reproduction. This is an expression-size problem, not
  a feature-count one, but it is the one rnmapbox report near our scale.
- [mapbox-gl-native#9513](https://github.com/mapbox/mapbox-gl-native/issues/9513),
  2017-07-14, SDK 5.1.0, Nexus 6P: building a clustered `GeoJsonSource` of
  20,000 points took 6 to 11 seconds on the UI thread. Old enough that it only
  shows the native path has had the same cost centre for years.

From `docs/research/mobile-map.md`: `rnmapbox` 10.3.5 sends a `ShapeSource`'s
whole FeatureCollection to native as one `JSON.stringify` string on every prop
change. MapLibre GL JS sends a GeoJSON source's data to its worker with
`postMessage`, and offers `updateData` for partial changes. So on the update path
the native stack is not obviously ahead either.

### What WebView map users report

- [maplibre-gl-js#4364](https://github.com/maplibre/maplibre-gl-js/issues/4364),
  2024-07-05: about 2,278 shapes in five FeatureCollection sources; drawing was
  fine, updating one source to move a shape was slow. No device named, no numbers.
- [mapbox-gl-js#13655](https://github.com/mapbox/mapbox-gl-js/issues/13655),
  2026-04-08, Pixel 7 Pro, Capacitor 8, Chrome 146: after upgrading Mapbox GL JS
  3.20 to 3.21, three frames of 8.5 s, 11.8 s and 5.1 s on load, most of it in
  terrain setup. A version regression, on a high-end phone, in a feature this
  project does not use. It shows a Capacitor map app in production on Mapbox GL
  JS, not a WebView ceiling.
- [maplibre-gl-js#1368](https://github.com/maplibre/maplibre-gl-js/issues/1368),
  2022-07-10, Galaxy S20, Cordova: crash with 3D terrain while panning, suspected
  out of memory. Terrain again.
- [capacitor discussion #3899](https://github.com/ionic-team/capacitor/discussions/3899),
  2020-12: general (not map) slowness, iPhone 11 under 2 s to start, Galaxy S20+
  about 3 s, Galaxy S7 Edge over 5 s. A 2022 reply found Android accessibility
  services slowed the WebView markedly. Reported timings, not a benchmark.

### Why the two stacks degrade at similar data sizes

This part is read off source, not measured. MapLibre GL JS cuts a GeoJSON source
into tiles with `geojson-vt` and clusters with `supercluster`, in a Web Worker.
MapLibre Native vendors `geojson-vt-cpp` (in `vendor/maplibre-native-base/deps`)
and `supercluster` (in `vendor`), the C++ ports of the same algorithms. So the
work per feature is the same shape on both stacks; the native one runs it as
compiled C++ off the UI thread, the WebView one as JIT-compiled JavaScript off
the main thread. Both then draw the same number of tiles and vertices, through
OpenGL ES or Vulkan on one side and WebGL (backed by the same GPU driver) on the
other. The maintainer advice on both sides is identical: prune properties, six
decimal places, source `maxzoom` around 12, cluster points, and move to vector
tiles past that ([MapLibre large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/),
[Mapbox large GeoJSON guide](https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/)).

That suggests the gap at our scale (15k Habitat polygons, 10k Address points,
417 Traps, 345 simplified Regions) is a constant factor rather than a different
breaking point. Nobody has published the constant.

## The Android WebView under memory pressure

What the platform says ([Handle WebView termination](https://developer.android.com/develop/ui/views/layout/webapps/handle-termination),
[Manage WebView objects](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)):

- The renderer is a separate process, killed either because it crashed or
  because "the system killed the renderer to reclaim memory"
  (`RenderProcessGoneDetail.didCrash()` is `false` in the second case).
- The handler "must return true"; otherwise WebView kills the app. Newer Android
  versions manage background processes more aggressively, so an app with no
  handler is "more likely" to show "visible foreground terminations when
  returning to the app", and these kills "aren't yet reflected in Play Console
  crash reports".
- `setRendererPriorityPolicy(RENDERER_PRIORITY_BOUND, true)` lowers the
  renderer to `WAIVED` when the WebView is not visible, which makes a kill more
  likely. The docs say not to change the policy without a termination handler.

What Capacitor does, read from `BridgeWebViewClient.java` at commit
[`81ae30a`](https://github.com/ionic-team/capacitor/blob/81ae30a503797e417dd125b06262dabc4696c88a/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java)
(2025-12-08): `onRenderProcessGone` ORs the results of every registered
`WebViewListener`, and `WebViewListener.onRenderProcessGone` returns `false` by
default. With no plugin returning `true`, a renderer kill becomes an app kill.
A plugin can register a listener through `bridge.addWebViewListener()` and
recreate the activity; `@capgo/capacitor-webview-crash`
([Cap-go/capacitor-webview-crash](https://github.com/Cap-go/capacitor-webview-crash/))
does that and persists the crash metadata. Capacitor's own issue asking for a
crash notification ([capacitor#2379](https://github.com/ionic-team/capacitor/issues/2379),
2020 to 2026) was closed in a backlog cleanup in February 2026 without a built-in
answer; [#7713](https://github.com/ionic-team/capacitor/issues/7713) was closed
as its duplicate.

What it costs the field app either way: a renderer kill drops the whole page,
which under Capacitor is the JavaScript heap holding TanStack DB's collections,
the command queue in memory, and the map. Anything not yet persisted is gone, and
the map and eager catalogs rebuild on reload. Under React Native the equivalent
event is the whole app process being killed in the background, which Android also
does; the difference is that a WebView renderer can be killed while the app
process survives, so there is one more way to lose state, and on Capacitor's
default it ends in an app kill.

How often: no source gives a rate. The Salesforce engineering post on hybrid app
memory ([engineering.salesforce.com](https://engineering.salesforce.com/measuring-the-memory-impact-for-hybrid-apps-ac4628a65d2e/),
undated) says only that under memory pressure the renderer is "highly vulnerable
to be killed" and that recovery means rebuilding the view and reloading. A
Chromium issue titled "The WebView onRenderProcessGone callback occurrence
increased by 18% since 8/19" ([chromium 361128473](https://issues.chromium.org/issues/361128473))
shows Google tracks the rate, but the issue body needs a sign-in and I could not
read it. The field-app-shaped trigger in the reports is leaving the app for a
heavy one, the camera above all: capacitor#2379's first report (2020-01-28) is a
photo plus canvas resize crashing the WebView; a 2022-03-25 comment describes the
crash after "an intensive app (such as a game)" and suspects low RAM.

## Hermes against V8 for data-heavy JavaScript

The question was whether TanStack DB's eager catalogs and live queries run worse
on Hermes (React Native) than on V8 (the Android WebView). TanStack DB itself has
no published engine comparison I could find. What exists is engine
microbenchmarks.

- **Design.** Hermes is "an interpreter optimized for very fast startup and
  small binary size", and against a JIT "at a steady state... a JIT will always
  have a perf advantage" (maintainer `tmikov`, [hermes#1294](https://github.com/facebook/hermes/issues/1294),
  2024-02-03). Hermes V1 shipped in React Native 0.82 as an opt-in and became the
  default in 0.84; the 0.82 post says it "does not yet contain JS-to-native
  compilation... or the JIT compilation" shown at React Native EU 2023
  ([0.82 post](https://reactnative.dev/blog/2025/10/08/react-native-0.82), 2025-10-08;
  [0.84 post](https://reactnative.dev/blog/2026/02/11/react-native-0.84), 2026-02-11).
  The 0.82 post measured V1 against the old Hermes on Expensify: on a low-end
  Android device, total time to interactive 7.6% faster and bundle load 3.2%
  faster.
- **Loops.** [hermes#1294](https://github.com/facebook/hermes/issues/1294),
  2024-02-03, Redmi Note 9: a 10,000,000-element loop took 15 ms in Node, 100 ms
  in the Android WebView, 60 ms on JSC under React Native and 1,400 ms on Hermes.
  The maintainer notes a JIT can delete an empty loop outright, so this is the
  worst case. The same reporter measured an HTML parse with cheerio at 3,500 ms on
  Hermes against 1,700 ms on JSC on the same phone.
- **JSON.** [hermes#811](https://github.com/facebook/hermes/issues/811),
  opened 2022-09-06 by a Tesla engineer: `JSON.parse` median 50 ms on Hermes
  against 15 ms on JSC and Node; still 26 ms against 6 ms (JSC) and 9 ms (Node)
  on an M4 Pro in September 2025. A rewrite landed in November 2025; the reporter
  measured a 65% reduction and "around 1.5x slower" than the others after it, and
  says it ships in Hermes V1 (React Native 0.84). These ran on a laptop CLI, not a
  phone.
- **Collections.** [hermes#1253](https://github.com/facebook/hermes/issues/1253),
  2024-01-16: building a `Set` or `Map` from a large array was slow because the
  constructors skipped the array fast path. A maintainer reported "multiple
  improvements that have sped it up by more than 10x" (2024-03-27).
- **Dates.** [hermes#930](https://github.com/facebook/hermes/issues/930),
  2023-03-03: local-time `Date` operations were 800x slower than JSC. Fixed in
  React Native 0.76 (2024-09-18); a user confirmed the improvement on 0.77.
- **Memory.** A WalmartLabs post from 2019-07-22 ("React Native Memory
  profiling (JSC vs V8 vs Hermes)", read second hand through a dev.to copy at
  [dev.to](https://dev.to/anotherjsguy/react-native-memory-profiling-jsc-vs-v8-vs-hermes-1c76))
  found Hermes lowest at startup (7 MB JS) and V8 lowest under a large data set,
  with Hermes crashing at 556 MB. It ran on x86_64, on a first Hermes release, and
  is too old to carry weight now.
- **V8 under React Native.** `Kudo/react-native-v8` was the way to get V8 with a
  JIT under React Native; its last push and last release (v2.5.1) are both
  2024-08-20. I would not plan on it for React Native 0.86.

Read together: for a workload of building and joining large in-memory
collections, the WebView's V8 has a JIT and Hermes does not, and the Hermes team
has been closing specific gaps one report at a time. Whether that matters for
TanStack DB's incremental live queries at 15k plus 10k plus 14k rows is not
answered by any of this. The loop and JSON numbers say the worst case is several
times slower on Hermes, not a few percent.

## Teams that moved

I found none with a map at the centre and numbers attached.

- A Medium post, "Why we migrated an entire app from Ionic to React Native"
  ([medium.com](https://medium.com/@miquelplanab/how-we-migrated-an-entire-app-from-ionic-to-react-native-and-why-314420496a19)),
  is quoted by search engines as reporting 1.5 to 2 times faster loading and
  better Google Maps features after the move. Medium refused the fetch, so I
  cannot say how it measured, what devices it used, or when. Treat it as one
  anecdote.
- An Ionic forum thread from 2026-09-10
  ([forum.ionicframework.com](https://forum.ionicframework.com/t/migrating-existing-react-native-android-ios-apps-to-capacitor-while-keeping-the-same-store-listings/252024))
  is a team going the other way, React Native to Capacitor, to ship one
  responsive web app. Maps and performance are not mentioned.
- Many "Capacitor vs React Native" comparison pages turned up. They cite no
  measurements of their own and I have not used them.

## A third option the ticket did not list

The Capawesome Capacitor MapLibre plugin (2026-09-25) draws a native MapLibre
view behind a transparent WebView, positioned by an empty DOM element. It takes
GeoJSON sources with line, fill and circle layers, and "offline tile management
is not part of this version". It would keep the UI in the WebView and the map in
MapLibre Native. Nobody has published experience with it yet; it is a week old.

## Conclusion

The evidence leans slightly toward a WebView map being workable at our scale
on a budget phone, on two grounds: the native SDK hits the same wall at the same
order of magnitude and its maintainers prescribe the same fixes (cluster, low
`maxzoom`, vector tiles), and the one WebView risk with a clear mechanism,
renderer death, has a known fix that Capacitor leaves to the app. On the
JavaScript side the evidence leans the other way from React Native's usual
reputation: for data-heavy code the WebView's V8 has a JIT and Hermes V1 does
not.

The strength is weak. Nothing published measures either stack on a 4 GB phone at
our feature counts, nothing gives a renderer-kill rate, and the migration stories
are anecdotes. It does not settle #1358 without a device.

It does let #1352 shrink. The Android decision does not need two throwaway apps
measured side by side; it needs a pass or fail answer for the WebView on the
floor device, and the React Native build only if the WebView fails. A cut-down
#1352:

1. One app, not two: MapLibre GL JS in a Capacitor shell, on a 4 GB phone with a
   budget chipset, with the prod clone's habitats, addresses, traps and Regions
   as GeoJSON sources, clustered, source `maxzoom` around 12 to 14.
2. Pan and zoom frame rate at that configuration, and the same with clustering
   off to find the margin. The pass bar is set before the run.
3. Renderer death on purpose: with the map and eager catalogs loaded, open the
   camera, take a photo, switch to two heavy apps, come back. Record whether
   `onRenderProcessGone` fired, with `didCrash()`, and check that a listener
   returning `true` brings the app back with its queued commands intact. This is
   the measurement nothing published gives.
4. The heap of the eager catalogs in the WebView, read from Chrome remote
   debugging.
5. Build the `@rnmapbox/maps` app only if 2 or 3 fail. The Hermes heap
   measurement and the OkHttp per-host limit item from #1344 apply only to that
   branch and move with it.

The Windows Electron half of #1352 (disk, first sync, Track redraw, basemap
size) is untouched by this research and stays as written.

## What remains unknown

- A frame rate for either stack at our feature counts on any budget phone.
- The rate of WebView renderer kills on 3 to 4 GB phones, in the background or
  the foreground, and whether a loaded WebGL map raises it.
- Whether TanStack DB's live queries over the eager catalogs are measurably
  slower on Hermes V1 than on the WebView's V8.
- The constant factor between `geojson-vt` in a worker and `geojson-vt-cpp` on
  the same phone.
- How the Capawesome native-behind-WebView plugin behaves under load; nobody has
  written about it.
