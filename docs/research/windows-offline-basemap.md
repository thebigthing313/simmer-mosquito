# An offline basemap for the Windows field app

Status: Current. Research only; nothing here is built and nothing here is a
decision.

Research for [Research: an offline basemap for the Windows field app](https://github.com/thebigthing313/simmer-mosquito/issues/1356),
part of [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
Checked on 2026-10-02. Sizes were measured with the `pmtiles` CLI 1.31.2
against the Protomaps daily build of 2026-10-02 (basemap version 4.15.2). The
Organization box was read out of the prod clone in the compose Postgres. Library
facts come from the published `maplibre-gl@6.11.2` and `pmtiles@4.5.0`
packages and their source, Capacitor's and Electron's source and docs, and
Mapbox's Product Terms dated July 21, 2026. Where I could not verify a claim I
say so.

## Summary

- **Size.** The Middlesex County Organization's Regions, habitats and traps sit
  in a box of about 1,435 km². With 1 km of margin, a Protomaps extract to its
  top zoom is **29 MB** (measured, then downloaded: 28,651,137 bytes). Zoom 14
  alone is 16 MB. The Protomaps basemap stops at zoom 15, so zoom 16 and up are
  drawn by overzooming zoom 15, which MapLibre does on its own. Adding the
  Organization's addresses to the box, as #1340 decided, takes the extract to
  **113 MB**, because 11 of 9,816 addresses are geocoded outside the county.
  Both are far under the 500 MB quota.
- **Building it.** The JS library cannot extract, so the server builds the file
  with the `pmtiles` CLI from a copy of a Protomaps build in our own bucket, and
  the app downloads one file. Protomaps keeps daily builds for a week and asks
  people not to hotlink them.
- **Reading it.** MapLibre reads PMTiles through `addProtocol` and the
  `pmtiles` `Protocol`. A file on disk needs a `Source` that reads byte ranges.
  The one path that works the same in Electron and in a Capacitor WebView is to
  store the file in the origin private file system (OPFS) and hand the `File`
  to `pmtiles`' own `FileSource`. Pointing `FetchSource` at Capacitor's local
  file URL does not work on Android: its 206 response carries the whole file
  from byte 0.
- **Porting.** 84 files in `apps/web` import `mapbox-gl` (75 source, 9 tests).
  83 of them are `import type` and one is the runtime loader. MapLibre exports
  the same class names, so most of the port is a specifier swap; 12 files move
  their style-spec types to `@maplibre/maplibre-gl-style-spec`. The draw
  control (13 files, about 3,000 lines) uses nothing MapLibre lacks. The tile
  `transformRequest` and the 401 recovery port as written, but the field app
  does not need them: #1340 has it draw records from synced rows and never call
  `/map/tiles`.
- **Style.** web's Streets cannot be carried over. Product Terms 2.11 limits a
  Studio style to a Mapbox Map, the style imports Mapbox Standard, which only
  Mapbox GL JS v3 reads, and its 48 own layers read `mapbox-streets-v8`
  source layers. A look close to Streets is a hand-built style over the
  Protomaps schema, starting from `@protomaps/basemaps`, and every layer Streets
  draws has a Protomaps counterpart except hillshade.
- **Attribution.** "© OpenStreetMap" linked to openstreetmap.org/copyright, in
  a corner of the map; it may collapse behind an info button. The extract on
  the device is ODbL data and keeps its licence notice. No Mapbox attribution
  is owed on a map that loads no Mapbox content.
- **Mapbox licence.** The GL JS v2+ licence limits the library to Mapbox
  products, so `mapbox-gl` cannot draw an OpenStreetMap PMTiles basemap at all.
  The Product Terms forbid systematically downloading map content (1.9) but
  allow an on-device cache of viewed tiles for 30 days (2.8.1). A prefetched
  offline area for GL JS needs a written exception. The email is drafted below.

## The Organization box

The prod clone holds one real Organization, Middlesex County Mosquito
Extermination Commission (`7800db78-…`), with 15,321 habitats, 417 traps, 345
Regions and 9,816 addresses. `st_extent` per table, live rows only:

| Table | Box (lon, lat) |
| --- | --- |
| regions | -74.63104, 40.25123 to -74.20495, 40.60869 |
| habitats | -74.62999, 40.25253 to -74.20772, 40.60841 |
| traps | -74.62993, 40.25564 to -74.21313, 40.60670 |
| addresses | -74.66879, 40.10727 to -73.98651, 41.02340 |

The Regions box holds every habitat and trap and is 1,435 km². 11 addresses
fall outside it, and those 11 stretch the box from 0.43° by 0.36° to 0.68° by
0.92°. #1340 computes the pack box from Regions, habitats, traps and addresses,
so a handful of bad geocodes nearly quadruple the area. Computing it from
Regions alone, or trimming outliers, would keep the pack at the county.

## Size of the extract

`pmtiles extract <build> out.pmtiles --bbox=… --maxzoom=… --dry-run` reads the
archive's directories over HTTP range requests and reports the size without
downloading tiles.

| Box | Max zoom | Tiles | Archive |
| --- | --- | --- | --- |
| Regions box + 1 km (-74.64288,40.24224,-74.19312,40.61768) | 14 | | 16 MB |
| Regions box + 1 km | 15 | 2,670 | 29 MB (downloaded: 28,651,137 bytes) |
| Regions, habitats, traps and addresses + 1 km (-74.68063,40.09828,-73.97467,41.03239) | 15 | 9,778 | 113 MB |
| New Jersey (-75.56,38.93,-73.89,41.36) | 15 | | 346 MB |

The build's header (`pmtiles show`) says `max zoom: 15`, and Protomaps' docs say
the basemap has "zoom levels from 0 to 15". So "zoom 16" in #1340 is not a
tile level this basemap has. The MapLibre style spec says of a vector source's
`maxzoom`: "Data from tiles at the maxzoom are used when displaying the map at
higher zoom levels", and the `pmtiles` protocol sets `maxzoom` from the
header. The map draws from zoom 15 data up to `MAX_MAP_ZOOM` (19). If zoom 16
tiles were wanted they would need our own Planetiler build; Protomaps says each
zoom level "roughly doubles the size", and zoom 14 to 15 measured 1.8 times
here, so a zoom 16 county pack would be on the order of 55 MB. That figure is
an estimate, not a measurement.

The 500 MB `TileStore` quota in #1340 is an `@rnmapbox/maps` setting. A PMTiles
file is one file the app writes itself, so its budget is whatever the app
checks before writing.

### How the app gets the file

- **The server builds it.** `pmtiles` 4.5.0's JS source is `index.ts` and
  `adapters.ts`, and neither extracts. Extracting is the Go CLI. So the device
  cannot cut its own box out of a remote build; the server runs `pmtiles
  extract` per Organization and stores the result.
- **From our own copy.** The downloads page says "hotlinking to these downloads
  are discouraged. Instead, you should copy the tileset to your own Cloud
  Storage", and the builds bucket "retains all builds for the past week" plus
  the latest of each patch version. The full planet is 138.5 GB. A regional
  master is cheaper: New Jersey is 346 MB, and every Organization in the state
  extracts from it with range reads (the county extract transferred 30 MB).
- **Refresh.** OpenStreetMap moves slowly for this purpose. A monthly extract,
  and a new one when the Organization's box grows, matches #1340's
  re-download rule without a server call per device. The app compares a
  version or ETag and downloads one file over Wi-Fi.
- **Box on the device or on the server.** #1340 computes the box on the
  device with no server call. With PMTiles the server has to know the box to
  cut the file, so the box moves to the server, which already holds every
  Region, habitat, trap and address.

## Reading a local PMTiles file in MapLibre GL JS

How MapLibre reads PMTiles at all: `maplibregl.addProtocol("pmtiles",
protocol.tile)` once, then a source `"url": "pmtiles://…"`. `addProtocol`
"Adds a custom load resource function that will be called when using a URL
that starts with a custom url schema." The `pmtiles` `Protocol` resolves the
URL to an instance registered with `protocol.add(new PMTiles(source))` by the
source's `getKey()`, or creates a `FetchSource` for it.

A `PMTiles` takes any object with `getBytes(offset, length, signal?, etag?)`
and `getKey()`. Three sources fit a file on a device:

- **`FileSource` over a `File`.** Built in; `getBytes` is
  `this.file.slice(offset, offset + length).arrayBuffer()`. It needs a browser
  `File`, which the origin private file system hands back from
  `FileSystemFileHandle.getFile()`. OPFS is in Chrome 86 and Chrome Android
  109, and MDN's compatibility data marks Android WebView as mirroring Chrome
  Android. Electron is Chromium. So one download path (stream the response into
  `createWritable()`) and one read path (`getFile()` into `FileSource`) serve
  both shells.
- **A custom `Source` over the shell.** In Electron the main process opens the
  file with Node's `fs.promises.open` and answers `FileHandle.read` for each
  range over `ipcRenderer.invoke`. In Capacitor, `Filesystem.readFile` takes
  `offset` and `length` since 8.1.0, and returns base64, which costs a third
  more bytes over the bridge. Both work and both are code we own.
- **`FetchSource` over a local URL.** It sends `range: bytes=a-b` and refuses a
  200 longer than the request. It does not check a 206's length.
  - Capacitor Android: `WebViewLocalServer.handleLocalRequest` answers any
    `Range` with status 206 and a `Content-Range` header, but the body is the
    whole file stream from byte 0; nothing skips to the requested offset. Read
    from source, not run: `FetchSource` would take the start of the file as the
    bytes at every offset. Do not use `convertFileSrc` for this.
  - Electron: `protocol.handle` with `net.fetch(pathToFileURL(…))` is the
    documented way to serve files, and the docs say nothing about range
    requests. Electron issue #38749 reports media served this way is not
    seekable. Unverified for PMTiles; the IPC source avoids the question.

What I would pick: OPFS and `FileSource` for both shells, with the Electron IPC
source as the fallback if OPFS storage proves evictable. Whether
`navigator.storage.persist()` is granted in Electron and in an Android WebView
I did not check, and an evicted basemap is a basemap that is gone offline.

Glyphs and sprites have to be on the device too. Protomaps publishes them in
`basemaps-assets` (Noto Sans glyphs under the SIL Open Font License, sprites
under MIT) and says they "can be downloaded as ZIP files … if you need to host
them yourself or offline." They ship inside the app bundle, so they need no
download.

## Porting apps/web's map code to MapLibre GL JS

`maplibre-gl` 6.11.2 is BSD-3-Clause and depends on `@types/geojson` itself, so
`geojson-adapter.ts`, which exists for the readonly tuples, keeps working.

| What | Files | Under MapLibre |
| --- | --- | --- |
| Imports from `mapbox-gl` | 84 (75 source, 9 tests) | 83 are `import type`. `Map`, `MapMouseEvent`, `GeoJSONSource`, `VectorTileSource`, `Marker`, `ErrorEvent` and `AttributionControl` are exported by `maplibre-gl` under the same names. |
| `ExpressionSpecification`, `LayerSpecification`, `CircleLayerSpecification` | 12 | Not re-exported by `maplibre-gl`; import from `@maplibre/maplibre-gl-style-spec`. The two specs' expression types differ in detail, so expect some `tsc` work. Unmeasured. |
| Runtime loader `mapbox-gl-loader.ts` | 1 | Imports `maplibre-gl` and `maplibre-gl/dist/maplibre-gl.css`. |
| `use-mapbox-map.ts` | 1 | Drop `accessToken`; `style` becomes a style object or local URL instead of `mapbox://`; register the `pmtiles` protocol once. |
| `transformRequest` returning `credentials: 'include'` | 1 | Same shape. MapLibre's `RequestParameters.credentials` is `'same-origin' \| 'include'`, "'include' to send cookies with cross-origin requests." |
| `tile-session-recovery.ts` (reads `event.error.status` and `url`, calls `setTiles`) | 1 | MapLibre throws `AJAXError` with `status`, `statusText`, `url`, `body`, and `VectorTileSource.setTiles` exists. Ports as written. |
| `geolocate-control.tsx` (`new Marker({ element })`) | 1 | `Marker` exists with the same option. |
| `mapboxgl-` CSS selectors | 3 files, 11 lines | MapLibre's classes are `maplibregl-`. |
| `text-font: ['DIN Pro Bold', …]` in `use-route-layer.ts` | 1 | A Mapbox-hosted font; becomes a Protomaps font such as Noto Sans Medium. |
| `mapbox-search-client.ts` (Search Box API) | 1 | Online only, and Product Terms 2.7.5 say POI results are used only "in conjunction with a Mapbox Map". Out of the offline map either way. |
| Studio style URLs in `map-styles.ts` | 1 | Cannot be used; see the style section. |
| Draw control (`draw-*.ts`, `use-draw-*.ts`, `use-map-draw.ts`) | 13, about 3,000 lines | GeoJSON sources, layers, `queryRenderedFeatures`, `setFeatureState`, mouse events and `style.load`, all present in MapLibre (`style.load` is fired in `src/ui/map.ts`). Type swap only. |
| `packages/mapping` | 0 | Provider-neutral already; two comments name Mapbox. |

Nothing in our own layer code uses a Mapbox v3 only feature: no imports, slots,
`config` expressions, emissive paint, fog or globe projection. Every
`addLayer` and `addSource` goes through `use-geojson-source.ts` or
`use-tile-layer.ts`, and no layer is inserted relative to a basemap layer id,
so a new basemap does not break layer order.

What changes for the field app is smaller than the table. #1340 has the field
app draw records only from synced rows, so the `/map/tiles` URL, the
`transformRequest` and the 401 recovery do not come along. The field app needs
the map lifecycle hook, the GeoJSON source and layer hooks, the geolocate
marker, and the draw control, most of it with a changed import line. The rest
of the table is the cost of moving `apps/web` itself, which the field app does
not require.

## A style close to Streets

web's Streets (`mapbox://styles/thebigthing313/cmsjd3mrr011f01s6dc775u0z`),
read from the Styles API:

- It imports `mapbox://styles/mapbox/standard` (190 layers). Imports are a
  Mapbox GL JS v3 feature; MapLibre's style spec has none.
- Over that it draws 48 layers of its own (1 background, 8 fill, 29 line, 9
  symbol, 1 circle) from `mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2`,
  in Roboto Condensed from Mapbox's font server.
- Product Terms 2.11: "For any style developed in or exported from Studio,
  Customer shall only use that style within Studio or on a Mapbox Map and not
  any other map design tool or non-Mapbox Map." A Mapbox Map is "any map that
  includes any Licensed Map Content". So translating the JSON layer by layer
  for MapLibre is not allowed, apart from being impractical.

What can be built: a style of our own over the Protomaps schema. Its layers are
`earth`, `water`, `landcover`, `landuse`, `buildings`, `boundaries`, `places`,
`pois`, `roads` and `transit`. Every source layer Streets reads has a
counterpart: roads by `kind` and `kind_detail` (motorway through service and
path), water and waterways, landuse, buildings with address points carrying
`addr_housenumber`, boundaries, place labels and POIs. Hillshade (2 of the 48
layers) has no counterpart in the vector basemap. `@protomaps/basemaps` 5.7.2
generates the layer list from a flavor (`light`, `dark`, `white`, `black`,
`grayscale`), so the work is a custom flavor with our colours from
`packages/design-tokens` and a few layer edits, not 48 layers by hand. The
fonts are Noto Sans unless we build Roboto Condensed glyphs ourselves; both
are open licences. It will look like Streets, not be Streets, and the two will
drift unless one of them is the source of the other.

## Attribution

- The Protomaps build's own metadata carries `© OpenStreetMap` linked to
  openstreetmap.org/copyright, and MapLibre's `AttributionControl` shows a
  source's attribution. Compact mode is fine.
- OSMF's guidelines: attribution "to 'OpenStreetMap'", making "clear that the
  data is available under the Open Database License"; for a browsable map it
  "should typically appear in a corner of the map". It may hide after
  interaction or after five seconds if it stays reachable from an info button
  or menu. Linking to the copyright page is recommended.
- ODbL 4.3 asks for that notice on a Produced Work, which a rendered map is.
  The `.pmtiles` file we ship to devices is the data itself, so 4.2 applies to
  it as well: distribute it under ODbL and keep its notices intact. We do not
  change the data, so share-alike costs nothing beyond keeping the licence
  with the file and naming it in the app's licence screen.
- Mapbox's attribution (Product Terms 1.4) applies "when using any Service
  Offering". A MapLibre map with a Protomaps basemap uses none, so it carries
  no Mapbox logo. The online Mapbox map in the first Windows slice still does.

## Whether Mapbox licenses offline GL JS use

What the documents say today:

- The GL JS licence (`LICENSE.txt`, v2.0 and later): "licensed under the Mapbox
  TOS for use only with the relevant Mapbox product(s)". So `mapbox-gl` cannot
  render a non-Mapbox basemap, which settles the renderer for an OpenStreetMap
  PMTiles file: it is MapLibre or nothing.
- Product Terms 1.9, the default: customer shall "(iii) not scrape or
  systematically download Licensed Map Content, (iv) only access Licensed Map
  Content … directly from Mapbox APIs, and (v) not export, download, cache or
  store Licensed Map Content".
- Product Terms 2.8.1, the exception: "Customer may cache that Licensed Map
  Content on an End User's device but caching is limited to thirty (30) days on
  the same device making the Mapping API request", populated "directly from the
  Mapping APIs", and "On mobile devices, Customer shall only cache up to the
  limits set in the Mobile SDKs".

So a web app may keep tiles a Collector has already viewed for 30 days, which
is close to "offline for the area I drove yesterday". It may not prefetch a
county. Whether a Windows tablet is a "mobile device" under 2.8.1 is not
defined. Neither is whether Mapbox's raster Satellite tiles may be drawn by
MapLibre, since 2.11 binds the Studio style and not the raster tileset.

### Draft email to Mapbox

To: Mapbox sales (through the contact form at mapbox.com/contact/sales, or our
account manager if we have one).

Subject: Offline map area for a Mapbox GL JS app on Windows tablets

> Hello,
>
> We build SIMMER, mosquito control software used by public mosquito control
> programs. Our web app uses Mapbox GL JS with two Studio styles on account
> `thebigthing313`. We are now building a field app for Windows tablets: the
> same web code packaged in Electron, and later the same app in an Android
> WebView. Crews work in places with no signal, so they need the map of their
> service area while offline.
>
> The areas are small. Our largest customer is one county, about 1,500 km²,
> and we would want our Streets style from zoom 0 to 16 over that box, on
> about 10 to 50 devices per customer, refreshed monthly.
>
> Reading the Product Terms of July 21, 2026, sections 1.9 and 2.8.1, we
> understand that a GL JS app may cache tiles it has already displayed for up
> to 30 days, and may not download an area ahead of time. We would like to ask:
>
> 1. Can we license prefetching a defined area of Licensed Map Content
>    (vector tiles, style, sprite and glyphs) for offline use in a GL JS app
>    running in Electron or an Android WebView? If so, under what product, what
>    limits on area, device count and retention, and at what price?
> 2. If not, is there a supported way for a desktop or WebView app to use the
>    tile packs the Mobile SDKs download, or is offline limited to the native
>    Mobile SDKs?
> 3. Is a Windows tablet running GL JS a "mobile device" under section 2.8.1,
>    and which cache limit applies to it?
> 4. Does section 2.11 prevent us from drawing Mapbox's satellite raster
>    tileset (Raster Tiles API, not a Studio style) in MapLibre GL JS, billed
>    per tile request, alongside an OpenStreetMap basemap we host ourselves?
> 5. How are Map Loads counted for a GL JS app in Electron that keeps one map
>    open through a working day?
>
> Thank you,
> [name]
> [role], SIMMER
> [phone]

## What I did not verify

- Any of this on a Windows tablet or in Electron or Capacitor. No app was
  built and the extract was not rendered.
- Whether OPFS storage is persistent in Electron and in an Android WebView, and
  how either behaves when the disk fills.
- `protocol.handle` and `net.fetch` answering range requests on a `file:` URL.
- Capacitor's iOS local server range handling; iOS is out of v1.
- How much `tsc` work the move to MapLibre's style-spec types is.
- A Protomaps flavor styled to match Streets, side by side.

## Sources

- Protomaps, [PMTiles for MapLibre GL](https://docs.protomaps.com/pmtiles/maplibre)
- Protomaps, [Basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- Protomaps, [Basemap layers](https://docs.protomaps.com/basemaps/layers) and
  [layers.md](https://github.com/protomaps/docs/blob/main/basemaps/layers.md)
- Protomaps, [Basemaps for MapLibre](https://docs.protomaps.com/basemaps/maplibre)
- Protomaps, [basemaps-assets](https://github.com/protomaps/basemaps-assets)
- Protomaps, [build metadata](https://build-metadata.protomaps.dev/builds.json)
  and [20261002.pmtiles](https://build.protomaps.com/20261002.pmtiles)
- [go-pmtiles 1.31.2](https://github.com/protomaps/go-pmtiles/releases/tag/v1.31.2)
- `pmtiles` JS, [`index.ts`](https://github.com/protomaps/PMTiles/blob/main/js/src/index.ts)
  and [`adapters.ts`](https://github.com/protomaps/PMTiles/blob/main/js/src/adapters.ts)
- MapLibre, [`addProtocol`](https://maplibre.org/maplibre-gl-js/docs/API/functions/addProtocol/),
  [`RequestParameters`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/RequestParameters/),
  [`RequestTransformFunction`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/RequestTransformFunction/),
  [`VectorTileSource`](https://maplibre.org/maplibre-gl-js/docs/API/classes/VectorTileSource/),
  [style spec sources](https://maplibre.org/maplibre-style-spec/sources/),
  [`ajax.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/util/ajax.ts),
  [`map.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/map.ts),
  and the published [`maplibre-gl@6.11.2`](https://www.npmjs.com/package/maplibre-gl) typings
- Mapbox, [GL JS `LICENSE.txt`](https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt)
- Mapbox, [Product Terms, July 21, 2026](https://www.mapbox.com/legal/product-terms)
  (PDF linked from that page), sections 1.4, 1.9, 2.7.5, 2.8.1, 2.11, 3.32, 3.36
- OpenStreetMap, [Copyright and licence](https://www.openstreetmap.org/copyright)
- OSMF, [Attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- Open Data Commons, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Electron, [`protocol`](https://www.electronjs.org/docs/latest/api/protocol),
  [`net.md`](https://github.com/electron/electron/blob/main/docs/api/net.md),
  [issue #38749](https://github.com/electron/electron/issues/38749)
- Capacitor, [utilities (`convertFileSrc`)](https://capacitorjs.com/docs/basics/utilities),
  [Filesystem](https://capacitorjs.com/docs/apis/filesystem),
  [`WebViewLocalServer.java`](https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java)
- MDN, [`StorageManager.getDirectory`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory)
  and [browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json)
- Node.js, [`FileHandle.read`](https://nodejs.org/api/fs.html#filehandlereadbuffer-offset-length-position)
