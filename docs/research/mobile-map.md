# What can draw the map on mobile, online and offline

Status: Current. Research only; nothing here is built and nothing here is a
decision.

Research for [Research: what can draw the map on mobile, online and offline](https://github.com/thebigthing313/simmer-mosquito/issues/1333),
part of [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
Checked on 2026-10-01. Library facts were read from the published npm tarballs
of `@rnmapbox/maps@10.3.5` and `@maplibre/maplibre-react-native@11.4.1`, from
their GitHub repositories, and from Mapbox's and Expo's own documentation. Where
I could not verify a claim I say so. The decisions this feeds are made in
"Location capture and geometry drawing on a phone" and in the spec.

## Summary

- Two libraries are credible on Expo SDK 57: `@rnmapbox/maps` (Mapbox Maps SDK
  v11 underneath) and `@maplibre/maplibre-react-native` (MapLibre Native
  underneath). Both are New Architecture native modules with an Expo config
  plugin, and neither runs in Expo Go. Nothing JS-only draws vector tiles on a
  phone.
- Both can send the ADR 0016 bearer on tile requests, through a process-wide
  header added from JS and limited to URLs matching a regex. Neither tells JS
  which tile failed or with what status, so the web app's 401 recovery
  (`tile-session-recovery.ts`) has no direct equivalent.
- Mapbox offline tile regions take **only Mapbox-hosted tilesets**. A Studio
  basemap can go offline; `/map/tiles/:tileset` cannot, under Mapbox. MapLibre
  offline packs download every source a style names inside a bounding box,
  custom servers included.
- Synced collections hold only centroids today (`lat`, `lng`, `geom_type`), not
  shapes. A GeoJSON layer drawn from them is a layer of points. Drawing lines
  and polygons offline needs geometry on the device, which the sync path
  forbids now.
- No library ships a draw or edit control for React Native. The web draw
  control is hand-written over a GeoJSON source; its ring arithmetic in
  `packages/mapping` is framework-free and reusable, its gesture layer is not.
- Mapbox mobile pricing is per monthly active user, with the first 25,000 free,
  and offline downloads are inside that. The mobile token cannot be
  URL-restricted.

## The two candidates

| | `@rnmapbox/maps` | `@maplibre/maplibre-react-native` |
| --- | --- | --- |
| Version checked | 10.3.5, published 2026-07-22 | 11.4.1 |
| Native engine | Mapbox Maps SDK v11, default `11.23.1` (`package.json` `mapbox` field) | MapLibre Native (open source) |
| Peer deps | `react-native >=0.79`, `expo >=47` | `react-native >=0.80`, `expo >=54`, `react >=19.1` |
| Architecture | New Architecture only since 10.3.0; the podspec raises an error on the old one | Codegen spec (`codegenConfig` in `package.json`), New Architecture |
| Expo plugin | `@rnmapbox/maps`, option `RNMapboxMapsVersion`; `RNMapboxMapsDownloadToken` is deprecated, "Download token is no longer required by Mapbox" | `@maplibre/maplibre-react-native`, options per platform (`nativeVersion`, `nativeVariant: "opengl" \| "vulkan"`, `locationEngine: "default" \| "google"`) |
| Licence and cost | SDK under Mapbox terms; billed per MAU | BSD; costs whatever the tile host charges |

`apps/mobile` is on Expo `~57.0.12`, React Native `0.86.3`, with
`newArchEnabled: true` in `app.json`, so both fit the version ranges. Neither
project states Expo 57 support in its docs. On React Native 0.86, `rnmapbox`
had an Android build failure report on AGP 8.9+ that a maintainer could not
reproduce on the AGP 8.12 that 0.86 pins ([rnmapbox/maps#4263](https://github.com/rnmapbox/maps/issues/4263),
closed 2026-09-22), and one open bug where a **globe** projection map renders
blank on about half of cold starts under 0.86 ([rnmapbox/maps#4278](https://github.com/rnmapbox/maps/issues/4278)).
A mercator map is not named in that report.

Sources: [rnmapbox install](https://rnmapbox.github.io/docs/install),
[rnmapbox plugin/install.md](https://github.com/rnmapbox/maps/blob/main/plugin/install.md),
[npm @rnmapbox/maps](https://www.npmjs.com/package/@rnmapbox/maps),
[npm @maplibre/maplibre-react-native](https://www.npmjs.com/package/@maplibre/maplibre-react-native),
[maplibre-react-native](https://github.com/maplibre/maplibre-react-native).

## Drawing the authenticated MVT tiles

What the server serves. `GET /map/tiles/:tileset/:z/:x/:y.mvt` in
`apps/server/src/map-tiles.ts` runs behind `authContextMiddleware`, scopes the
tile to `authContext.organization.id`, and answers
`application/vnd.mapbox-vector-tile` with **no `Cache-Control` header**. Twelve
tilesets exist (`createTileSetRegistry`). Filters are whitelisted query
parameters (ADR 0009). There is also `GET /map/tiles/:tileset/extent`.

How web sends the credential. `use-mapbox-map.ts` passes a `transformRequest`
that returns `credentials: 'include'` for URLs under the server origin, so the
cookie rides along. Since #298 the tile routes verify the access token rather
than renewing it (`apps/web/src/components/map/tile-session-recovery.ts`
header), so a tile request never rotates the session; an expired token gets a
401, and web recovers by listening to GL's per-tile `error` event, renewing
through `/auth/me`, and re-pointing the source.

How mobile would send it. ADR 0016 has the server read
`Authorization: Bearer <sealed session>` when there is no cookie.

- `@rnmapbox/maps` exports `addCustomHeader(name, value, { urlRegexp })` and
  `removeCustomHeader(name)` (`src/RNMBXModule.ts`). Natively it installs a
  Mapbox `HttpServiceInterceptor` that adds the header to every request the SDK
  makes whose URL matches. A `VectorSource` takes `tileUrlTemplates`, so it can
  point at `https://<server>/map/tiles/habitats/{z}/{x}/{y}.mvt?…`. Two traps
  read off the native code:
  - iOS tests the regex with `firstMatch` (a substring match), Android with
    Kotlin `Regex.matches` (the whole URL must match). A pattern has to be
    written as a full-URL match, such as `^https://api\.example\.com/map/tiles/.*$`,
    to behave the same on both.
  - Android's interceptor removes any `Authorization` header from every request
    before adding the custom ones (`CustomHttpHeaders.kt`, `onRequest`). That
    is harmless for Mapbox's own requests, which carry `access_token` in the
    query string, and it means the bearer only arrives through the custom
    header.
- `@maplibre/maplibre-react-native` exports `TransformRequestManager` with
  `addHeader({ id, match, name, value })`, `addUrlTransform` and
  `addUrlSearchParam`; re-adding an `id` updates it in place. On Android it
  installs an OkHttp interceptor through `HttpRequestUtil.setOkHttpClient`,
  which is the client every MapLibre HTTP request goes through.

In both, the header is process-wide state held natively. When `authFetch`
stores a rotated session, the app has to set the header again; nothing ties the
two together.

Refusals. Neither library hands JS the HTTP status of a failed tile.
`rnmapbox`'s `onMapLoadingError` is typed `() => void`; MapLibre's
`onDidFailLoadingMap` carries `null`. So the web pattern, "a 401 from our
origin triggers a renewal and a refetch", cannot be copied. What is left is
renewing ahead of expiry and forcing a reload by changing the source's URL
template (for example a session generation query parameter the server
ignores), which I have not tried on a device.

Sources: [rnmapbox `RNMBXModule.ts`](https://github.com/rnmapbox/maps/blob/main/src/RNMBXModule.ts),
[`CustomHttpHeaders.swift`](https://github.com/rnmapbox/maps/blob/main/ios/RNMBX/CustomHttpHeaders.swift),
[`CustomHttpHeaders.kt`](https://github.com/rnmapbox/maps/blob/main/android/src/main/java/com/rnmapbox/rnmbx/modules/CustomHttpHeaders.kt),
[rnmapbox MapView](https://rnmapbox.github.io/docs/components/MapView),
[MapLibre `TransformRequestManager.ts`](https://github.com/maplibre/maplibre-react-native/blob/main/src/modules/transform-request/TransformRequestManager.ts),
ADR 0009, ADR 0016.

## Drawing geometry from synced collections as GeoJSON

What is on the device. ADR 0009's 2026-07-07 refinement lets the
trigger-maintained centroid columns `lat`, `lng` and `geom_type` sync, and keeps
`geom` and `geojson` off the sync path: "the raw `geom` and the generated
`geojson` are **never** streamed". `packages/sync`'s row schemas say the same
(`habitats.ts`: "geometry is served by the `/map/*` endpoints"). So a GeoJSON
layer built from synced rows today is points at centroids. A habitat polygon,
a route line or a Region boundary is not in any collection. `docs/sync.md`'s
mobile matrix says "Owned geometry: persisted with the locatable records already
persisted on the device", which needs that rule changed or a second read path
that persists geometry; the matrix does not say which.

How GeoJSON reaches the native map. `rnmapbox`'s `ShapeSource` takes `shape`
(a geometry, Feature or FeatureCollection) and passes it to native as
`JSON.stringify(shape)` on every prop change (`ShapeSource.tsx` `_getShape`,
`utils/index.ts` `toJSONString`). The whole collection crosses the bridge as one
string and is re-parsed and re-tiled natively each time it changes. The Mapbox
SDK v11 has partial update APIs (`addGeoJSONSourceFeatures`,
`updateGeoJSONSourceFeatures`), but `rnmapbox` 10.3.5 does not call them; I
found no reference in its `src`, `ios` or `android` trees. `ShapeSource` also
takes `url`, an HTTP or file URL, which avoids holding the JSON in the JS heap.
It offers `cluster`, `clusterRadius`, `maxZoomLevel`, `buffer` and `tolerance`.

At what count it stops being usable. No primary source gives a number for
phones, and I did not measure one. What Mapbox publishes is advice, not a
threshold: GeoJSON sources "are turned into Mapbox vector tiles on-the-fly by
the client (web browser or mobile device)"; prune properties and keep six
decimal places (their example went from 19.3 MB to 3.3 MB); set the source's
`maxzoom` below the default 18, "a value of 12 is a good balance" for points;
cluster dense points; and for more than that, tile on the server. ADR 0009 made
the same call for this codebase: "an agency may catalog tens of thousands of
larval habitats", which is why open-ended maps are MVT. Measured scale I could
find in this repo: production holds 345 Regions (`docs/region-membership-spec.md`)
and 417 traps (`docs/research/full-history-clone-cost.md`). Habitat counts were
not in any doc I found. A device benchmark at those counts is what would answer
this; the spec should ask for one rather than take a number from here.

Sources: [Working with large GeoJSON sources](https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/),
[Mapbox Android GeoJSON performance example](https://docs.mapbox.com/android/maps/examples/android-view/geojson-performance/),
[rnmapbox `ShapeSource.tsx`](https://github.com/rnmapbox/maps/blob/main/src/components/ShapeSource.tsx),
ADR 0009, `docs/sync.md`.

## Offline basemap packs

What Mapbox allows (Maps SDK v11, "Offline: Concepts and Constraints"):

- A **style pack** holds the style JSON, sprites, fonts and other non-tile
  resources, "typically only a few megabytes", once per style.
- A **tile region** is a GeoJSON geometry (point, line, polygon or
  multipolygon), a zoom range and a style. The SDK picks the **tile packs** that
  cover it. Pack zoom bands are fixed: 0 to 5 (about 1.4K tiles), 6 to 10
  (about 341), 11 to 14 (about 85), 15 to 16 (about 320). Asking for zoom 8 to
  15 downloads 6 to 16.
- Size: "Tile packs can vary significantly in size depending on the area
  covered and the zoom levels included, often ranging from tens to hundreds of
  megabytes." Mapbox publishes no per-area figure.
- Limit: "The cumulative number of unique tile packs used in the tile regions
  cannot be greater than 750."
- "Only tilesets hosted on Mapbox servers are supported for offline use. You can
  either use Mapbox tilesets, or custom tilesets you have created with Mapbox
  Tiling Service." Tile regions support only sources whose URLs follow the
  Mapbox v4 tile URL schema. So the two Studio basemaps in
  `apps/web/src/components/map/map-styles.ts` (`mapbox://styles/thebigthing313/...`)
  can go offline, and `/map/tiles/:tileset` cannot.
- Tiles fetched outside a region go to a separate disk cache, with "no
  guarantees about how long these resources will be cached". The tile store
  has no size limit unless `TileStoreOptions.diskQuota` is set.
- Licensing: "Our terms of service do not allow developers or end users to
  redistribute offline maps downloaded from Mapbox servers... the data may not
  be preloaded, bundled or otherwise redistributed." Each device downloads its
  own.
- Billing: "Resources downloaded for offline use are included in the regular
  monthly active user (MAU) billing" (Mapbox help, "Offline maps"). Legacy SDK
  pages say the opposite, that offline tile requests are billed per request;
  those pages are for the pre-v10 SDK and do not apply to v11.

What `rnmapbox` exposes. `offlineManager.createPack({ name, styleURL, bounds,
minZoom, maxZoom, tilesets, metadata })` takes a **bounding box**, not the
arbitrary geometry the native SDK accepts (`OfflineCreatePackOptions.ts`).
`TileStore.shared(path)` and `setOption` reach the disk quota. The example app
has `CacheOffline/OfflineTilesets.tsx` for the tileset form.

Scoping a pack to an Organization. Nothing in the SDKs knows about an
Organization; a pack is a geometry and a zoom range. What exists to build one
from: `GET /map/tiles/:tileset/extent` already returns an Organization-scoped
extent for any tileset, and Regions are polygons the Organization owns. Under
`rnmapbox` the pack is that extent's bounding box. A polygon-shaped pack, which
Mapbox says cuts download size compared with a bounding box, would need the
native API `rnmapbox` does not expose.

MapLibre's offline. `OfflineManager.createPack({ mapStyle, bounds, minZoom,
maxZoom, metadata })`, also a bounding box. MapLibre Native downloads the
resources of every source in the style, from any server, which is how a style
naming `/map/tiles/...` could be packed. On Android the header interceptor sits
on the OkHttp client every MapLibre request uses, so the bearer would reach
those downloads; I did not confirm the iOS path or test either. A pack of our
tiles is a snapshot of operational data at download time and is stale against
the synced rows from the next write. `setTileCountLimit` caps the tile count
and its docblock says to "Consult the Terms of Service for your map tile host
before changing this value."

Using Mapbox's basemap through MapLibre is allowed and billed differently:
"When consuming tiles through a third-party library (rather than Mapbox GL
JS), tile requests are billed individually under the Maps API" (Mapbox, "Use
Mapbox APIs in MapLibre GL JS"). The Vector Tiles API's free tier is 200,000
tile requests a month. Whether Mapbox's terms allow MapLibre to store Mapbox
tiles in an offline pack I could not settle: the product terms page did not
render for me, and the offline guide's terms sentence is written about the
Mapbox SDK. That is a question for Mapbox before anyone relies on it.

Sources: [Offline: Concepts and Constraints (Android, v11)](https://docs.mapbox.com/android/maps/guides/offline/concepts/),
[Offline (iOS, v11)](https://docs.mapbox.com/ios/maps/guides/offline/),
[Offline maps (Mapbox help)](https://docs.mapbox.com/help/dive-deeper/mobile-offline/),
[legacy iOS pricing](https://docs.mapbox.com/ios/legacy/maps/guides/pricing/),
[rnmapbox `OfflineCreatePackOptions.ts`](https://github.com/rnmapbox/maps/blob/main/src/modules/offline/OfflineCreatePackOptions.ts),
[Use Mapbox APIs in MapLibre GL JS](https://docs.mapbox.com/help/dive-deeper/mapbox-in-maplibre/),
[Vector Tiles API](https://docs.mapbox.com/api/maps/vector-tiles/),
[Mapbox pricing](https://www.mapbox.com/pricing).

## User location, heading and accuracy

- `rnmapbox`'s `locationManager` delivers `coords` with `latitude`,
  `longitude`, `accuracy` ("The radius of uncertainty for the location, measured
  in meters"), `heading`, `course`, `speed`, and a `timestamp`. Its own docblock
  warns that on Android `heading` "is incorrectly reporting the course value"
  ([rnmapbox/maps#1213](https://github.com/rnmapbox/maps/issues/1213)).
  `UserLocation` takes `minDisplacement`, `onUpdate`,
  `showsUserHeadingIndicator`, `requestsAlwaysUse`. `LocationPuck` takes
  `puckBearing: 'heading' | 'course'`, `puckBearingEnabled`, and a `pulsing`
  circle whose radius can be `'accuracy'`, drawing the horizontal accuracy on
  the map.
- MapLibre's `LocationManager` reports `accuracy` and `heading`, and its plugin
  can switch Android to Google Play Services' location engine
  (`locationEngine: "google"`) "for higher precision".
- `expo-location` is the source independent of either map. `watchPositionAsync`
  returns `coords.accuracy` in metres; `Accuracy.Highest` and
  `Accuracy.BestForNavigation` request the best fix. `watchHeadingAsync`
  returns `trueHeading` ("needs location permissions, will return -1 if not
  given"), `magHeading`, and a compass calibration `accuracy` of 0 to 3, which on
  iOS maps to under 20, 35 and 50 degrees of uncertainty. Its config plugin sets
  `locationWhenInUsePermission`, which is what the `rnmapbox` install guide
  points to for the iOS permission string.

Sources: [rnmapbox `locationManager.ts`](https://github.com/rnmapbox/maps/blob/main/src/modules/location/locationManager.ts),
[rnmapbox `LocationPuck.tsx`](https://github.com/rnmapbox/maps/blob/main/src/components/LocationPuck.tsx),
[expo-location](https://docs.expo.dev/versions/latest/sdk/location/).

## Drawing and editing a Point, LineString or Polygon on touch

No library gives a draw control. `rnmapbox` has `MapView` `onPress` and
`onLongPress`, `ShapeSource` `onPress` with a `hitbox` (44 by 44 points by
default), and `PointAnnotation` with `draggable`, `onDragStart`, `onDrag` and
`onDragEnd`. Nothing drags a vertex of a line or polygon. Its own example of
drawing (`example/src/examples/LineLayer/DrawPolyline.tsx`) puts a crosshair at
the centre of the screen, has the user pan the map under it, and appends the
centre coordinate on a button press, redrawing the line through a `ShapeSource`.
That is the pattern a finger needs, because a finger covers the point it taps.

What SIMMER has today. The web draw control is hand-written over a mapbox-gl
GeoJSON source: `apps/web/src/hooks/map/use-map-draw.ts` and its
`use-draw-*` siblings, with parts and modes in `components/map/draw-parts`.
ADR 0018 fixes its rules: the toggle is Point, Line, Polygon and never says
Multi; a second part promotes the shape in place; a part list appears at two
parts; a hole is cut into a part the user names first, "so nothing is
hit-tested to guess which part was meant". The ring arithmetic is in
`packages/mapping` with no React and no map: `draw-vertex-edit.ts`
(`moveRingVertex`, `insertRingVertex`, `removeRingVertex`, `nearestRingEdge`,
`closeRing`) and `sketch.ts` (`reshapePath`, `splitRings`). A phone control can
reuse those as they are. The hooks are tied to `mapbox-gl`'s `Map` and DOM
events and cannot.

What a touch version has to answer that web did not: vertex handles big enough
to hit with a finger, which the 44-point hitbox default speaks to; how a drag
on a handle is told apart from a pan of the map; and naming a part before a
hole, which ADR 0018 already settles as a list choice rather than a tap.

Sources: [rnmapbox `DrawPolyline.tsx`](https://github.com/rnmapbox/maps/blob/main/example/src/examples/LineLayer/DrawPolyline.tsx),
[rnmapbox `PointAnnotation.tsx`](https://github.com/rnmapbox/maps/blob/main/src/components/PointAnnotation.tsx),
ADR 0018, `packages/mapping/src/draw-vertex-edit.ts`, `packages/mapping/src/sketch.ts`.

## What it costs in the build

- **A development build.** "React Native Mapbox Maps cannot be used in the
  'Expo Go' app, because it requires custom native code." The same holds for
  MapLibre. Expo's answer is a development build, "essentially your own version
  of Expo Go where you are free to use any native libraries", made with
  `npx expo install expo-dev-client` and `eas build --profile development` or
  `npx expo run:ios|android`. `apps/mobile` has no `expo-dev-client`, no
  `eas.json` and only `expo-router` in `plugins` today.
- **A config plugin entry.** `["@rnmapbox/maps", { "RNMapboxMapsVersion": "..." }]`
  or the MapLibre one. Config plugins run at `npx expo prebuild`; without EAS
  Build the docs say to run `expo prebuild --clean` after a plugin change.
- **No download token any more.** The `rnmapbox` plugin marks
  `RNMapboxMapsDownloadToken` deprecated: "Download token is no longer required
  by Mapbox. Do not set this." So no secret `sk.` token is needed at build time.
- **A public access token in the app.** `Mapbox.setAccessToken('pk...')` at
  runtime. Mapbox URL restrictions do not apply: they do not support "Requests
  from mobile applications built with the Mapbox Maps or Navigation SDKs". A
  separate token per client is what Mapbox recommends, so a leaked mobile token
  can be rotated without touching web. In this repo web reads
  `VITE_MAPBOX_ACCESS_TOKEN`; mobile would need its own variable through Expo's
  public env or `extra`.
- **Pricing.** "Maps SDKs for Mobile" are billed per monthly active user:
  free up to 25,000, then $4.00 per 1,000 to 125,000. A user counts once per
  billing period across upgrades; deleting and reinstalling counts again.
  MapLibre itself is free, and the cost moves to whatever serves its basemap.
- **New Architecture only** for `rnmapbox` 10.3+, which `apps/mobile` already
  is.

Sources: [rnmapbox install](https://rnmapbox.github.io/docs/install),
[rnmapbox `withMapbox.ts`](https://github.com/rnmapbox/maps/blob/main/plugin/src/withMapbox.ts),
[Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/),
[Expo config plugins](https://docs.expo.dev/config-plugins/introduction/),
[Mapbox access tokens](https://docs.mapbox.com/accounts/guides/tokens/),
[Maps SDK for iOS pricing](https://docs.mapbox.com/ios/maps/guides/pricing/),
[Mapbox pricing](https://www.mapbox.com/pricing).

## What I did not verify

- Any of this on a device. No build was made.
- Whether Mapbox's terms allow a non-Mapbox SDK to keep Mapbox tiles offline.
- Whether MapLibre Native's iOS offline downloader carries headers set through
  `TransformRequestManager`.
- How either SDK's disk cache treats a tile response with no `Cache-Control`,
  which is what `/map/tiles` sends.
- A GeoJSON feature count at which a phone becomes unusable.
- Whether a Mapbox Studio style renders the same in MapLibre.
