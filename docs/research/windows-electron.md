# The Windows field app on Electron

Status: Current. About work that is not built: no Electron app exists in the
workspace.

Research for
[Research: the Windows field app on Electron](https://github.com/thebigthing313/simmer-mosquito/issues/1355),
part of [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
It follows the four React Native notes on the map, and reuses what carries over:
[mobile-tanstack-db-persistence.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-tanstack-db-persistence/docs/research/mobile-tanstack-db-persistence.md),
[mobile-electric-shapes.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-electric-shapes/docs/research/mobile-electric-shapes.md),
[mobile-session-switch.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-session-switch/docs/research/mobile-session-switch.md)
and [mobile-fetch.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-fetch/docs/research/mobile-fetch.md).

Checked on 2026-10-02 against `develop` and the versions on npm that day. Every
library claim was read from npm registry metadata, the published tarball on
unpkg at the version named, the project's repository at a tag or commit, or the
vendor's own docs, and is linked. Chromium was read at `main` on its GitHub
mirror, which is newer than the Chromium inside Electron; where that gap could
matter, I say so. Nothing was run on a tablet. Where only a device can settle
something, the note says what the measurement has to show.

This is facts, not a decision. The decisions belong to the map's tickets.

## Versions in play

| Package | Version | Notes |
| --- | --- | --- |
| `electron` | 44.5.1, released 2026-09-29 | Chromium 152.0.7977.130, Node 24.21.0, `NODE_MODULE_VERSION` 149 ([releases.json](https://releases.electronjs.org/releases.json)) |
| `@tanstack/db` | 0.11.0 is the version the map settled on; 0.11.1 and 0.11.3 were published on 2026-10-02 | [registry](https://registry.npmjs.org/@tanstack/db) |
| `@tanstack/db-sqlite-persistence-core` | 0.4.0, pins `@tanstack/db` 0.11.0 exactly | [registry](https://registry.npmjs.org/@tanstack/db-sqlite-persistence-core) |
| `@tanstack/electron-db-sqlite-persistence` | 0.2.1, pins core 0.4.0 exactly | [registry](https://registry.npmjs.org/@tanstack/electron-db-sqlite-persistence) |
| `@tanstack/node-db-sqlite-persistence` | 0.2.25, pins core 0.4.0 and `better-sqlite3 ^12.6.2` | [registry](https://registry.npmjs.org/@tanstack/node-db-sqlite-persistence) |
| `better-sqlite3` | 12.11.1 is the newest in `^12.6.2`; 13.0.3 is latest | [registry](https://registry.npmjs.org/better-sqlite3) |
| `@electric-sql/client` | 1.5.23 in `pnpm-lock.yaml` | through `@tanstack/electric-db-collection` |
| `electron-builder` | 26.17.0, released 2026-09-26 | read at tag [`electron-builder@26.17.0`](https://github.com/electron-userland/electron-builder/tree/electron-builder%4026.17.0) |

## The answer

- **SQLite: `@tanstack/electron-db-sqlite-persistence` 0.2.1 over
  `@tanstack/node-db-sqlite-persistence` 0.2.25 over `better-sqlite3` 12.x**, all
  on `@tanstack/db` 0.11.0. SQLite runs in the main process and the renderer
  reaches it over one IPC channel. The catch is the native module: 12.11.1 has
  Windows prebuilds for Electron up to ABI 146 (Electron 42) and none for 43 or
  44, so a current Electron means `@electron/rebuild` from source in CI, or
  pinning Electron 42. `better-sqlite3` 13 is Node-API and would load on any
  Electron, but the Node adapter's range excludes it.
- **Geolocation reaches the Windows location service on Electron 40 and later**,
  because Chromium 144 made the WinRT `Geolocator` the default provider on
  Windows with no network fallback. `enableHighAccuracy` maps to
  `PositionAccuracy.High`, and `accuracy` is the `Geocoordinate` value passed
  through. A Track does **not** keep recording when the window is minimised:
  Blink stops geolocation on a hidden page. `backgroundThrottling: false` keeps
  the page visible while minimised. Nothing keeps a desktop app running once
  the screen is off on battery: Modern Standby suspends it within five minutes
  of the sleep timeout, whatever `powerSaveBlocker` asked for.
- **The session should be the bearer from ADR 0016, encrypted with
  `safeStorage` in the main process.** The cookie does not work from a page
  served off a custom scheme, because the server sets it `SameSite=Lax` and a
  custom scheme is cross-site to `api.simmer-data.com`. Either way the server
  has to admit a new CORS origin, which `APP_ORIGIN` and `ADMIN_APP_ORIGIN`
  cannot express today. WorkOS redirect URIs need nothing, because sign-in is
  the in-app `POST /auth/sign-in` and no client uses the hosted redirect.
- **Shipping: per-user NSIS from electron-builder, wrapped for Intune as a Win32
  app, signed through Artifact Signing or an OV certificate on an HSM, updated
  by `electron-updater` from one generic feed per environment.**
  `electron-updater` updates NSIS only, never MSI or MSIX. MSIX is the
  alternative, updating through App Installer or Intune instead.
- **Electric and `sessionFetch` run in the renderer as they do in `apps/web`.**
  Almost none of the React Native findings apply: there is no `expo/fetch`, no
  missing `crypto`, no Metro. Two things do: Electric pauses its streams when
  `document.hidden` is true, which is the same switch that stops a Track, and
  the cookie jar question from #1343 has a Chromium twin.

## SQLite on disk, and the TanStack DB adapter

### The packages at `@tanstack/db` 0.11.0

TanStack's [SQLite persistence guide](https://github.com/TanStack/db/blob/95c3f9ec9745f9f9dc44380e95f7106c46d20e59/docs/guides/sqlite-persistence.md)
lists an Electron runtime package, and its whole Electron section is one
sentence: "The Electron package uses a main-process SQLite owner and a renderer
bridge."

| Package | Version on db 0.11.0 | Published | Depends on |
| --- | --- | --- | --- |
| `@tanstack/electron-db-sqlite-persistence` | 0.2.1 | 2026-09-30 | `@tanstack/db-sqlite-persistence-core` 0.4.0 only |
| `@tanstack/node-db-sqlite-persistence` | 0.2.25 | 2026-09-30 | core 0.4.0, `better-sqlite3 ^12.6.2` |
| `@tanstack/offline-transactions` | 1.0.58 | 2026-09-30 | `@tanstack/db` 0.11.0 |

Read from the registry packuments linked in the table above. The Electron
package ships no SQLite driver. Electron 0.2.0 and 0.2.3 appear in its
changelog but not on npm, so 0.2.1 is the first 0.2.x anyone can install.

### How it is built

Read from the 0.2.1 source
([`main.ts`](https://unpkg.com/@tanstack/electron-db-sqlite-persistence@0.2.1/src/main.ts),
[`renderer.ts`](https://unpkg.com/@tanstack/electron-db-sqlite-persistence@0.2.1/src/renderer.ts),
[`README.md`](https://unpkg.com/@tanstack/electron-db-sqlite-persistence@0.2.1/README.md)):

- The main process opens `better-sqlite3`, wraps it with
  `createNodeSQLitePersistence`, and calls
  `exposeElectronSQLitePersistence({ ipcMain, persistence })`. That registers
  one `ipcMain.handle` on `tanstack-db:sqlite-persistence` dispatching nine
  methods (`loadSubset`, `applyCommittedTx`, `loadCollectionMetadata` and the
  rest).
- The handler does not check `event.sender` or `senderFrame`, so any frame that
  can invoke the channel can read and write every collection. The preload has
  to expose a narrow `invoke` for this one channel, not the generic
  `invoke(channel, ...args)` the TanStack example exposes.
- The renderer calls `createElectronSQLitePersistence({ invoke })`. It imports
  nothing from `electron` at runtime, so it works with `contextIsolation: true`
  and `nodeIntegration: false`, which are Electron's defaults
  ([web-preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)).
  Each call times out after 5,000 ms by default.
- Main and renderer halves must be the same version: the changelog says "mixed
  v1/v2 peers fail closed"
  ([CHANGELOG](https://github.com/TanStack/db/blob/95c3f9ec9745f9f9dc44380e95f7106c46d20e59/packages/electron-db-sqlite-persistence/CHANGELOG.md)).
- The Node driver sets `journal_mode = WAL`, `synchronous = NORMAL` and
  `foreign_keys = ON` by default
  ([`node-driver.ts`](https://unpkg.com/@tanstack/node-db-sqlite-persistence@0.2.25/src/node-driver.ts)).
- The row layout, the schema-version reset, the stored `electric:resume` state
  and the absence of any row pruning are the core package's, and the persistence
  note on the map already describes them. Core 0.4.0 does not change that
  picture for this question.

The map's settled design, one SQLite file per Account and Organization holding
rows, queue and Tracks (#1345), fits this shape: the main process opens the file
for the signed-in pair and exposes it. The guide says the same in its own words,
"Persisted readiness does not prove current authorization. Isolate SQLite data
by user or tenant." The `command_queue` table from #1335 would live in the same
file behind its own narrow IPC handlers. TanStack's
[Electron example](https://github.com/TanStack/db/tree/95c3f9ec9745f9f9dc44380e95f7106c46d20e59/examples/electron/offline-first)
does exactly that for its outbox, a `kv_store` table beside the collection
tables. The example wraps a Query collection, not an Electric one, so nothing
upstream shows the Electric collection running under Electron persistence.

### The native module

- `better-sqlite3` 12.11.1 installs with `prebuild-install || node-gyp rebuild`
  and builds against one ABI. Its Windows x64 Electron prebuilds stop at
  `electron-v146`, which is Electron 42
  ([release v12.11.1](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1)).
  A v12.12.0 GitHub release adds `electron-v148` but was never published to npm.
- On Electron 43 or 44 the prebuild lookup fails and the module has to be
  compiled for Electron's ABI, which Electron's docs do with `@electron/rebuild`
  ([Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)).
  That needs the MSVC build tools on the build machine.
- `better-sqlite3` 13.0.0 moved to Node-API and ships its binary inside the npm
  tarball, so "prebuilt binaries should theoretically work across different
  versions of Node.js and Electron"
  ([release v13.0.0](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0);
  [13.0.3 package.json](https://unpkg.com/better-sqlite3@13.0.3/package.json)).
  The Node adapter's `^12.6.2` excludes it. `createNodeSQLitePersistence` takes a
  `database` instance and does not construct one when given one, so handing it a
  13.x `Database` may work, but TanStack does not test that and its types target
  12.
- `node:sqlite` is in Electron 44's Node 24.21 as a release candidate
  ([Node 24.21 docs](https://nodejs.org/docs/v24.21.0/api/sqlite.md)), but
  Electron broke it once in 37.2.0
  ([electron#47671](https://github.com/electron/electron/issues/47671)) and no
  TanStack driver uses it. It would need a hand-written `SQLiteDriver` against
  core's interface
  ([`persisted.ts`](https://unpkg.com/@tanstack/db-sqlite-persistence-core@0.4.0/src/persisted.ts)).

Open issues on TanStack DB about SQLite persistence that apply to every runtime,
all filed 2026-10-01 or 02, are listed by
[this search](https://github.com/TanStack/db/issues?q=is%3Aopen+sqlite+persistence)
(#1990, #1991, #1992, #1993, #1994). None mentions Electron.

## Geolocation on a Windows tablet

### Which provider answers `navigator.geolocation`

- Chromium's `kLocationProviderManager` is on by default on Windows with mode
  `kPlatformOnly`, which means the WinRT `Geolocator` and no network fallback
  ([`device_features.cc`](https://github.com/chromium/chromium/blob/main/services/device/public/cpp/device_features.cc)).
  The commit that made it the default, "Enable Win platform location provider by
  default", first shipped in Chrome 144
  ([6be3f2d1a5](https://github.com/chromium/chromium/commit/6be3f2d1a57d75b00e07db60dee0b225e6a4d76e)).
- Electron 40.0.0 was the first major on Chromium 144
  ([releases.json](https://releases.electronjs.org/releases.json)). So Electron
  40 and later read the Windows location service, which reads a GNSS receiver
  when the tablet has one. Electron 39 and earlier used Google's network
  provider, which is where the old `GOOGLE_API_KEY` failures
  ([electron#36252](https://github.com/electron/electron/issues/36252),
  [electron#47955](https://github.com/electron/electron/issues/47955)) came from.
  Electron's own
  [environment-variables doc](https://github.com/electron/electron/blob/v44.5.1/docs/api/environment-variables.md)
  still says geolocation needs Google's web service; in code that is only true
  of the network provider.
- Windows' own switches gate it. Chromium creates no provider when
  `DeviceAccessInformation` reports the location class as denied by the system
  or the user, and maps `PositionStatus_Disabled` to `PERMISSION_DENIED`
  ([`location_provider_winrt.cc`](https://github.com/chromium/chromium/blob/main/services/device/geolocation/win/location_provider_winrt.cc)).
  Desktop apps have no per-app location control; they are governed together by
  "Let desktop apps access your location"
  ([Windows location service and privacy](https://support.microsoft.com/en-us/windows/privacy/windows-location-service-and-privacy)).
  An Organization's IT can turn location off by policy, and the app sees a
  permission error.
- Electron grants every permission when the app sets no handler, and for
  `geolocation` it opts into location services; a custom
  `setPermissionRequestHandler` must answer `true` for `geolocation`
  ([`electron_permission_manager.cc`](https://github.com/electron/electron/blob/v44.5.1/shell/browser/electron_permission_manager.cc);
  [session docs](https://github.com/electron/electron/blob/v44.5.1/docs/api/session.md)).
  On Windows Electron shows no OS prompt of its own.
- An MSIX package declares the `location` capability, but a packaged desktop app
  runs full trust outside an AppContainer and "packaging alone doesn't make every
  capability necessary"
  ([capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)).

### What accuracy it reports

All from `location_provider_winrt.cc` at Chromium `main`:

- `enableHighAccuracy: true` sets `PositionAccuracy_High`, otherwise `Default`.
  Microsoft documents those as indirectly setting `DesiredAccuracyInMeters` to
  10 m and 500 m
  ([DesiredAccuracy](https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation.geolocator.desiredaccuracy)).
- `MovementThreshold` is hard-coded to 1 m and `ReportInterval` is never set. A
  stationary receiver may raise no `PositionChanged` at all, so a
  `watchPosition` with a `timeout` can fire `TIMEOUT` while the tablet stands
  still. That is my reading of
  [ReportInterval](https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation.geolocator.reportinterval),
  not something the docs state for this case.
- `accuracy` is `Geocoordinate.Accuracy` passed through, and so are heading and
  speed. Altitude is dropped unless it is ellipsoidal with an accuracy.
- `PositionSource` (satellite, Wi-Fi, cellular) goes only to Chromium's metrics.
  The page cannot tell a satellite fix from a Wi-Fi fix except by `accuracy`.
- `timestamp` is when Chromium converted the fix, not the fix time.

The map's rule from #1337, warn above ±25 m, can read `accuracy` directly.

### Whether a Track keeps recording

- **Minimised: no, by default.** Blink's `Geolocation` stops updating when the
  page is not visible and drops results that arrive while hidden
  ([`geolocation.cc`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/geolocation/geolocation.cc)).
  On Windows a page goes hidden when its window is minimised or hidden.
- **`backgroundThrottling: false`** keeps the page `visible` "even if the window
  is minimized, occluded, or hidden"
  ([BrowserWindow, page visibility](https://github.com/electron/electron/blob/v44.5.1/docs/api/browser-window.md)).
  That should keep `watchPosition` delivering while minimised. Chromium's Windows
  occlusion tracker also marks every window occluded when the session locks or
  the display turns off
  ([`native_window_occlusion_tracker_win.cc`](https://github.com/chromium/chromium/blob/main/ui/aura/native_window_occlusion_tracker_win.cc)),
  and the sources do not settle whether that reaches page visibility under
  `backgroundThrottling: false`.
- **Screen off on battery: no, whatever the app does.** A Modern Standby device
  enters standby when the display turns off. Power requests hold "for up to 5
  minutes on DC power", then the Desktop Activity Moderator "suspends desktop
  applications"
  ([Prepare software for Modern Standby](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/prepare-software-for-modern-standby)).
  `PowerSetRequest`'s docs say the same, and that every request ends when the
  user sleeps the device with the power button
  ([PowerSetRequest](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-powersetrequest)).
- **`powerSaveBlocker`.** `prevent-app-suspension` is
  `PowerRequestExecutionRequired` and `prevent-display-sleep` is
  `PowerRequestDisplayRequired`
  ([`power_save_blocker_win.cc`](https://github.com/chromium/chromium/blob/main/services/device/wake_lock/power_save_blocker/power_save_blocker_win.cc);
  [Electron docs](https://github.com/electron/electron/blob/v44.5.1/docs/api/power-save-blocker.md)).
  Only the second helps a Track, by keeping the display on so standby never
  starts. It costs battery for as long as a Track records.
- Reading `Windows.Devices.Geolocation` from the main process through a native
  addon avoids Blink's visibility rule and exposes `ReportInterval`,
  `PositionSource` and the fix time, but it is suspended by the same standby.
  NodeRT, the usual binding, was last pushed in 2024
  ([NodeRT](https://github.com/NodeRT/NodeRT)), so this would be our own small
  C++/WinRT addon.

### What a tablet has to show

1. On Electron 44 with `enableHighAccuracy: true`, outdoors, `accuracy` of a few
   metres, and no request to `googleapis.com`.
2. Which privacy switch state makes the app get `PERMISSION_DENIED`, unpackaged
   and as MSIX, and whether "precise location" off gives coarse fixes or an
   error.
3. With `backgroundThrottling: false`, fixes keep arriving while minimised,
   while covered by another window, and while the session is locked. Log
   `document.visibilityState` beside each fix.
4. The fix rate standing still and moving, given the 1 m threshold.
5. With `prevent-display-sleep`, the display stays on past the idle timeout on
   battery. With the display off, the gap in the Track lines up with suspension
   in `powercfg /sleepstudy`.

## Where the session lives

### What the server does today

- `readSealedSession` takes the cookie first, then `Authorization: Bearer`
  (`apps/server/src/auth/session-transport/read-sealed-session.ts`).
  `writeSealedSession` always sets the cookie, `httpOnly`, `SameSite=Lax`, 30
  days, and echoes `x-simmer-session` only to a request carrying
  `x-simmer-client: token` (`write-sealed-session.ts`, `is-token-client.ts`).
  #1345 has since settled that a token client gets no cookie and has none read.
- CORS admits the origins in `env.appOrigins`, which is `APP_ORIGIN` plus
  `ADMIN_APP_ORIGIN` and nothing else (`apps/server/src/env.ts`,
  `allowedCorsOrigins` in `main.ts`). Every surface sends `credentials: true` and
  exposes `x-simmer-session` (`cors-options.ts`). Hono's `cors()` matches the
  `Origin` header exactly against that list and, with no `allowHeaders`
  configured, echoes `Access-Control-Request-Headers`, so `authorization` and
  `x-simmer-client` already pass a preflight once the origin does
  (`hono@4.12.18`, `dist/middleware/cors/index.js`).
- Sign-in is in-app: `apps/web` and `apps/mobile` both call
  `POST /auth/sign-in` through `packages/auth`. The WorkOS redirect URI is used
  only by `GET /auth/login` and `/auth/callback`, which no client calls, and
  `docs/deployment.md` lists the two registered callbacks on the API hosts.
  Password reset and invitation emails link to `APP_ORIGIN`, so they open the
  web app in a browser, not the field app.

### The cookie from an Electron page

Electron's docs say web storage and cookies are disabled for a custom scheme
unless it is registered as standard, and recommend a standard scheme to replace
`http` ([protocol](https://www.electronjs.org/docs/latest/api/protocol)). Even
then, a page at `app://...` calling `https://api.simmer-data.com` is cross-site
by scheme, and the server's `SameSite=Lax` cookie is sent cross-site only on a
top-level navigation with a safe method
([RFC 6265bis, section 5.2](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.2)).
So the cookie would not ride on shape or command requests without moving the
server to `SameSite=None`, which loosens it for `apps/web` too. A page loaded from
`file://` is worse: its `Origin` is `null`, and admitting `null` admits every
sandboxed page on the internet.

Electron's cookie store also flushes to disk "every 30 seconds or 512
operations" ([cookies](https://www.electronjs.org/docs/latest/api/cookies)), the
same lag that #1343 found on Android, where a lost rotation leaves a spent
refresh token in the jar.

### The bearer in `safeStorage`

- `safeStorage` is a main-process module. On Windows its key comes from DPAPI,
  so the data is "protected from other users on the same machine, but not from
  other apps running in the same userspace", and it is available only after the
  app's `ready` event
  ([safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)). That
  is weaker than an Android keystore against malware running as the same user,
  and equal to it against another Windows account on a shared tablet.
- `SessionTransport` in `packages/auth` is three async functions, `read`,
  `write` and `clear` (`packages/auth/src/client/session-transport.ts`). A
  preload that exposes exactly those three over IPC, backed by `safeStorage` and
  a file in `userData` in the main process, is a transport `createAuthClient`
  takes unchanged. The token client then sends the bearer and
  `x-simmer-client: token`, and writes every rotation back, as on Android.
- The token client's `fetch` sends `credentials: 'include'`
  (`create-auth-fetch.ts`). Under #1345's server change that is inert; until
  then, a Chromium renderer would store whatever cookie it is allowed to.

### What the server needs either way

- **A new CORS origin.** `appOrigins` takes two variables today, one of them
  admin, so the field app's origin needs a third variable or a list. With a
  custom scheme the origin is something like `app://field`. Whether Chromium in
  Electron 44 sends that exact string as `Origin` from a scheme registered
  `standard` and `secure` is not stated in the docs, and is the first thing to
  log on a device. The same scheme should be registered `secure`, since
  `crypto.randomUUID`, which `@tanstack/db` uses for transaction ids, exists
  only in a secure context.
- **Nothing for WorkOS** while sign-in stays in-app.
- **The alternative that avoids CORS** is to send requests from the main process
  with `net.fetch` and hand results over IPC, since CORS is a renderer rule. That
  puts every shape long poll through IPC, and Electric's client would need a
  fetch that proxies a `Response`. I did not find a primary source describing
  that pattern with Electric.

## Shipping

### Installer formats and which ones update themselves

| Format | Built by | Updates itself through | Source |
| --- | --- | --- | --- |
| NSIS, per-user (default) | electron-builder `nsis` | `electron-updater`, no elevation | [nsisOptions.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/app-builder-lib/src/targets/nsis/nsisOptions.ts), [auto-update.md](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/website/docs/features/auto-update.md) |
| NSIS, per-machine | electron-builder `nsis` with `perMachine` | `electron-updater` through `elevate.exe`, which needs an admin | [NsisUpdater.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/electron-updater/src/NsisUpdater.ts) |
| MSI | electron-builder `msi` (WiX) | "Not supported via electron-updater" | [msi.md](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/website/docs/msi.md) |
| MSI wrapping NSIS | electron-builder `msiWrapped` | the wrapped NSIS app's updater | [msi-wrapped.md](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/website/docs/msi-wrapped.md) |
| MSIX | electron-builder `appx`; Forge `msix` maker (experimental) | App Installer `.appinstaller`, Intune, or Electron's own `autoUpdater` from v41 | [appx.md](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/website/docs/appx.md), [App Installer](https://learn.microsoft.com/en-us/windows/msix/app-installer/app-installer-file-overview), [auto-updater.md](https://github.com/electron/electron/blob/v44.5.1/docs/api/auto-updater.md) |

`electron-updater` on `win32` always instantiates `NsisUpdater`
([main.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/electron-updater/src/main.ts)).
For MSIX, electron-builder's docs say the `publisher` must exactly match the
signing certificate's subject, which Microsoft's manifest schema says too
([Identity](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-identity)).

### Intune

- A Win32 app is an `.intunewin` made with the Content Prep Tool, installed
  silently in System or User context, and found by a detection rule on an MSI
  product code, a file, a registry value or a script
  ([Win32 app management](https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-app-management),
  [Add a Win32 app](https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-add)).
  A user-context install that needs admin rights fails.
- A line-of-business app takes `.msi`, `.appx` and `.msix` directly, and has an
  "Ignore app version" switch for apps that update themselves, because otherwise
  Intune and the app's updater race
  ([LOB apps](https://learn.microsoft.com/en-us/intune/intune-service/apps/lob-apps-windows)).
- No Microsoft page names the conflict between a self-updating NSIS app and a
  Win32 detection rule. Reading the two pages together: a rule pinned to an
  exact version stops matching after the app updates itself, and Intune offers
  the old version again within about 24 hours. A rule that checks presence, or
  version greater than or equal, does not.

The combinations that work with users who are not admins:

1. Per-user NSIS, deployed in User context, updating itself with no elevation,
   detected by presence under `%LocalAppData%\Programs` or `HKCU`.
2. Per-machine NSIS or MSI in System context with self-update off, and IT
   shipping each release through Intune supersedence. Updates then move at IT's
   pace, not ours.
3. MSIX as a line-of-business app, updated through Intune or an
   `.appinstaller` file. Whether an Intune-deployed MSIX also honours an
   `.appinstaller` update association is not covered by any page I found.

### Code signing

- Since 1 June 2023 every publicly trusted code signing key, OV or EV, has to be
  generated and kept in a hardware module, and from 1 March 2026 a certificate
  lasts at most 460 days
  ([CA/B Forum Code Signing Baseline Requirements](https://github.com/cabforum/code-signing/blob/main/docs/CSBR.md),
  sections 6.2.7.4.2 and 6.3.2). In practice that is a USB token or a cloud HSM.
- EV no longer skips SmartScreen; "that behavior was removed in 2024"
  ([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
  [code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)).
  electron-builder's own Windows signing page still says EV works without
  warnings, which is out of date. Apps pushed through Intune never pass
  through a browser download, so SmartScreen reputation matters less here
  than for a public download.
- Artifact Signing, formerly Trusted Signing, is Microsoft's managed service.
  Organizations in the US and several other regions are eligible
  ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart));
  the MSIX signing overview also states a three-year verifiable history rule
  that the quickstart and FAQ do not repeat
  ([signing overview](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview)),
  so eligibility needs checking for SIMMER's own entity. Its certificates live
  about three days and are reissued daily under the same name. The Basic tier
  is $9.99 a month for 5,000 signatures
  ([Azure retail prices](https://prices.azure.com/api/retail/prices?$filter=contains(serviceName,'Signing'))).
  electron-builder signs with it through `win.azureSignOptions`
  ([winOptions.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/app-builder-lib/src/options/winOptions.ts)).
- An MSIX signed by an Organization's own CA installs when IT pushes that root
  as trusted through Intune or Group Policy
  ([code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)).
  That needs one build per customer, so a public certificate is simpler.

### An update channel per environment

- The generic provider fetches `${channel}.yml` from the configured `url`;
  `channel` defaults to `latest`. The first `publish` entry is written into
  `app-update.yml` at build time
  ([publishOptions.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/builder-util-runtime/src/publishOptions.ts),
  [GenericProvider.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/electron-updater/src/providers/GenericProvider.ts),
  [publish.md](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/website/docs/publish.md)).
- So a staging build and a production build can carry different `publish.url`
  values, one feed per environment, and each build is pinned to its server by
  the same build-time configuration that names its API. Setting
  `autoUpdater.channel` at runtime also works but turns on `allowDowngrade`
  ([AppUpdater.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/electron-updater/src/AppUpdater.ts)).
  No doc prescribes one pattern.
- `verifyUpdateCodeSignature` defaults to on: the updater checks the
  downloaded installer's Authenticode signature with `Get-AuthenticodeSignature`
  and compares the publisher name stored at build time
  ([NsisUpdater.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/packages/electron-updater/src/NsisUpdater.ts)).
  With Artifact Signing rotating certificates daily under one subject, the name
  should still match; no source says so outright.

## Electric shape streams and `sessionFetch` in the renderer

The renderer is Chromium, so Electric's client runs as it does in `apps/web`:
`fetch`, `URL`, `AbortController` and `crypto.randomUUID` (in a secure context)
are native, and `localStorage` exists for Electric's two caches on a standard
scheme. `packages/sync` needs only `setSessionFetcher(authClient.fetch)` with
the token client over the `safeStorage` transport, plus the session recovery,
the same two calls `apps/web/src/app-auth.ts` makes with `cookieFetch`.

What carries over from the React Native notes:

| Finding on the map | In Electron |
| --- | --- |
| `getRandomValues` must be installed | Does not apply: Chromium has `crypto` |
| `expo/fetch` can hang or truncate a body read; pick React Native's fetch | Does not apply: Chromium's `fetch` |
| Electric 1.5.23 fails to detect `AppState`; pass `runtimeVisibility` | Does not apply as stated. Electric uses `document.visibilitychange` when it exists ([client.ts](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts), `#subscribeToVisibilityChanges`) and pauses every stream while the page is hidden. That is the same switch Blink uses to stop geolocation, so `backgroundThrottling: false` keeps both running while minimised, and leaving it on stops both. `alwaysVisibleRuntime` in `packages/sync` is the other way to keep streams live. |
| Offline resumes from the in-memory offset; nothing survives a restart without persistence | Applies unchanged, and the Electron persistence wrapper stores `electric:resume` the same way |
| The generated factories leave no place to wrap persistence | Applies unchanged |
| OkHttp allows five requests per host, so commands queue behind long polls Chromium has its own per-host connection limit for HTTP/1.1, which HTTP/2 lifts. I did not read the limit from Chromium source or check which protocol the API answers on, so this is open; a device log of a command sent while every collection holds a long poll would settle it. |
| The device holds the session in a cookie jar as well as the keystore | Applies in a narrower form: Chromium's jar will not send or set a `SameSite=Lax` cookie cross-site, and #1345's server change removes the question |
| A stale handle 409s after an Organization switch; key storage by Account and Organization | Applies unchanged |

## Sources

- npm registry packuments, read 2026-10-02:
  [`@tanstack/electron-db-sqlite-persistence`](https://registry.npmjs.org/@tanstack/electron-db-sqlite-persistence),
  [`@tanstack/node-db-sqlite-persistence`](https://registry.npmjs.org/@tanstack/node-db-sqlite-persistence),
  [`@tanstack/db-sqlite-persistence-core`](https://registry.npmjs.org/@tanstack/db-sqlite-persistence-core),
  [`better-sqlite3`](https://registry.npmjs.org/better-sqlite3),
  [`electron`](https://registry.npmjs.org/electron).
- Published source:
  [`electron-db-sqlite-persistence@0.2.1`](https://unpkg.com/browse/@tanstack/electron-db-sqlite-persistence@0.2.1/src/),
  [`node-db-sqlite-persistence@0.2.25`](https://unpkg.com/browse/@tanstack/node-db-sqlite-persistence@0.2.25/src/),
  [`db-sqlite-persistence-core@0.4.0`](https://unpkg.com/browse/@tanstack/db-sqlite-persistence-core@0.4.0/src/),
  [`@electric-sql/client@1.5.23`](https://unpkg.com/browse/@electric-sql/client@1.5.23/src/).
- TanStack DB at
  [`95c3f9ec`](https://github.com/TanStack/db/tree/95c3f9ec9745f9f9dc44380e95f7106c46d20e59):
  SQLite persistence and offline transactions guides, the Electron example.
- better-sqlite3 releases
  [v12.11.1](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1)
  and [v13.0.0](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0).
- Electron at `v44.5.1`: docs for
  [web-preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences),
  [BrowserWindow](https://github.com/electron/electron/blob/v44.5.1/docs/api/browser-window.md),
  [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage),
  [protocol](https://www.electronjs.org/docs/latest/api/protocol),
  [cookies](https://www.electronjs.org/docs/latest/api/cookies),
  [powerSaveBlocker](https://github.com/electron/electron/blob/v44.5.1/docs/api/power-save-blocker.md),
  [autoUpdater](https://github.com/electron/electron/blob/v44.5.1/docs/api/auto-updater.md),
  [native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules);
  source
  [`electron_permission_manager.cc`](https://github.com/electron/electron/blob/v44.5.1/shell/browser/electron_permission_manager.cc),
  [`electron_browser_client.cc`](https://github.com/electron/electron/blob/v44.5.1/shell/browser/electron_browser_client.cc);
  [releases.json](https://releases.electronjs.org/releases.json).
- Chromium at `main`:
  [`location_provider_winrt.cc`](https://github.com/chromium/chromium/blob/main/services/device/geolocation/win/location_provider_winrt.cc),
  [`device_features.cc`](https://github.com/chromium/chromium/blob/main/services/device/public/cpp/device_features.cc),
  [`geolocation.cc`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/geolocation/geolocation.cc),
  [`power_save_blocker_win.cc`](https://github.com/chromium/chromium/blob/main/services/device/wake_lock/power_save_blocker/power_save_blocker_win.cc),
  [`native_window_occlusion_tracker_win.cc`](https://github.com/chromium/chromium/blob/main/ui/aura/native_window_occlusion_tracker_win.cc),
  commit [6be3f2d1a5](https://github.com/chromium/chromium/commit/6be3f2d1a57d75b00e07db60dee0b225e6a4d76e).
- Microsoft:
  [Geolocator DesiredAccuracy](https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation.geolocator.desiredaccuracy),
  [ReportInterval](https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation.geolocator.reportinterval),
  [location privacy](https://support.microsoft.com/en-us/windows/privacy/windows-location-service-and-privacy),
  [capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations),
  [Modern Standby](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/prepare-software-for-modern-standby),
  [PowerSetRequest](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-powersetrequest),
  [Intune Win32 apps](https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-win32-add),
  [Intune LOB apps](https://learn.microsoft.com/en-us/intune/intune-service/apps/lob-apps-windows),
  [App Installer](https://learn.microsoft.com/en-us/windows/msix/app-installer/app-installer-file-overview),
  [SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
  [code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
  [Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart),
  [MSIX signing overview](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview),
  [manifest Identity](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/element-identity).
- [CA/B Forum Code Signing Baseline Requirements](https://github.com/cabforum/code-signing/blob/main/docs/CSBR.md);
  [RFC 6265bis draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis).
- electron-builder at
  [`electron-builder@26.17.0`](https://github.com/electron-userland/electron-builder/tree/electron-builder%4026.17.0).
- In this repo: `apps/server/src/cors-options.ts`, `apps/server/src/env.ts`,
  `apps/server/src/main.ts`, `apps/server/src/auth/session-transport/`,
  `apps/server/src/auth/session-routes/`, `packages/auth/src/client/`,
  `packages/sync/src/collections/functions/sync-collection.ts`,
  `apps/web/src/app-auth.ts`, `docs/deployment.md`, ADR 0016.
