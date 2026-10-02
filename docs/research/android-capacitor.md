# The Android field app on Capacitor

Status: Current. About work that is not built: no Capacitor app exists in the
workspace.

Research for
[Research: the Android field app on Capacitor](https://github.com/thebigthing313/simmer-mosquito/issues/1362),
after
[React Native or Capacitor for the field app on Android](https://github.com/thebigthing313/simmer-mosquito/issues/1358)
chose Capacitor. It is the Android counterpart of
[windows-electron.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/windows-electron/docs/research/windows-electron.md),
and reuses what carries over from
[mobile-tanstack-db-persistence.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-tanstack-db-persistence/docs/research/mobile-tanstack-db-persistence.md)
and
[windows-offline-basemap.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/windows-offline-basemap/docs/research/windows-offline-basemap.md).

Checked on 2026-10-02 against `develop` and the versions on npm that day. Every
library claim was read from npm registry metadata or the published tarball at
the version named (linked through unpkg), and every Chromium claim from
Chromium `main` on its GitHub mirror, which is newer than the WebView on most
phones. Android and Play claims come from developer.android.com,
source.android.com and Play Console Help, with the page's own "last updated"
date where it shows one. I say "read in source" when I read code and "the docs
say" when I only have the vendor's word. Nothing was run on a phone. Where only
a device can settle something, the note says what the measurement has to show.

This is facts, not a decision. The decisions belong to the map's tickets.

## Versions in play

| Package | Version | Published | Notes |
| --- | --- | --- | --- |
| `@capacitor/core`, `@capacitor/android` | 8.5.2 | 2026-09-11 | Android `minSdkVersion` 24, `targetSdkVersion` and `compileSdk` 36 by default ([`build.gradle`](https://unpkg.com/browse/@capacitor/android@8.5.2/capacitor/build.gradle)) |
| `@tanstack/db` | 0.11.0 is the version the map settled on | 2026-09-30 | 0.11.1 and 0.11.3 followed on 2026-10-02 |
| `@tanstack/capacitor-db-sqlite-persistence` | 0.2.25 pins core 0.4.0, which pins `@tanstack/db` 0.11.0 | 2026-09-30 | peer `@capacitor-community/sqlite ^8.0.1` ([registry](https://registry.npmjs.org/@tanstack/capacitor-db-sqlite-persistence)) |
| `@tanstack/browser-db-sqlite-persistence` | 0.2.25, same core pin | 2026-09-30 | peer `@journeyapps/wa-sqlite ^1.4.1` |
| `@capacitor-community/sqlite` | 8.1.1 | 2026-08-06 | SQLCipher for Android 4.17.0, `minSdkVersion` 24 |
| `@electric-sql/client` | 1.5.23 in `pnpm-lock.yaml`; 1.5.28 read | 2026-09-09 | `electric-db-collection` 0.5.1 takes `^1.5.15` |
| `maplibre-gl` | 6.11.2 | 2026-09-24 | WebGL2 only, ES2022 target |
| `@capgo/background-geolocation` | 8.4.7 | 2026-09-22 | MIT |
| `@capacitor-community/background-geolocation` | 1.2.26 | 2025-08-28 | MIT, no release in 13 months |
| `@transistorsoft/capacitor-background-geolocation` | 9.6.0 | 2026-09-27 | licence required for release builds |
| `@capgo/capacitor-webview-crash` | 8.1.10 | 2026-09-15 | |
| `@aparajita/capacitor-secure-storage` | 8.0.1 | 2026-09-23 | |
| `capacitor-secure-storage-plugin` | 0.13.0 | 2026-01-10 | |
| `vite` in `apps/web` | 8.0.10 | | default `build.target` is Chrome 111 |

## The answer

- **Persistence: `@tanstack/capacitor-db-sqlite-persistence` 0.2.25 over
  `@capacitor-community/sqlite` 8.1.1, not `wa-sqlite` over OPFS.** The native
  file lives in the app's `databases` directory, which Android never evicts,
  and native code can open it, which the Track recorder needs. OPFS in a
  WebView is best-effort storage that Chromium's quota manager may evict and
  that `navigator.storage.persist()` cannot protect, because WebView denies
  that permission in source. The queue, Tracks and TanStack's rows can share
  one file per Account and Organization, with one trap: the adapter owns one
  connection and serialises only its own calls, so a queue write sent on that
  connection while TanStack is inside `BEGIN IMMEDIATE` joins TanStack's
  transaction.
- **Background location: none of the three plugins records a Track that
  survives renderer death and works offline as shipped.** The two free ones
  hand every fix to JavaScript and drop it when nothing is listening, and the
  Capgo one stops its service when its plugin instance is destroyed, which is
  what renderer recovery does. Transistorsoft persists fixes natively in its
  own SQLite but needs a paid licence. The `location` foreground service needs
  `FOREGROUND_SERVICE_LOCATION` and a visible notification, and does not need
  `ACCESS_BACKGROUND_LOCATION` if it starts while the app is on screen. Play's
  policy allows that shape when the user starts and stops the Track. I found
  no page saying how Play reviews a private app.
- **Session: the bearer in an Android Keystore AES-GCM key through
  `@aparajita/capacitor-secure-storage`, with the ciphertext kept out of Auto
  Backup.** The cookie never rides: Capacitor turns third-party cookies on,
  but the server sets `SameSite=Lax`, and `https://localhost` is cross-site to
  the API, so Chromium sends the cookie on no `fetch`.
- **Renderer death: recreate the activity, as `@capgo/capacitor-webview-crash`
  does, and keep nothing the queue needs in memory.** Capacitor cannot swap the
  WebView inside a live `Bridge`, so a hand-written listener ends up calling
  `activity.recreate()` too. The work is in what survives: the queue and Track
  must be rows in SQLite before the user is told anything is saved, and the
  Track recorder must not be a plugin that a recreate tears down.
- **WebView floor: Chromium 111, set as `android.minWebViewVersion` together
  with `server.errorPath`, plus a user-agent check in an inline script.**
  111 is what Vite 8 compiles `apps/web` for. MapLibre 6 needs at least 94 for
  its syntax and WebGL2. Capacitor's own check only refuses when `errorPath` is
  set, and it compares a Huawei WebView by Huawei's version number, which is
  how the Chromium 88 device in maplibre-gl-js#8157 would pass a floor of 111.
- **Visibility: auto-detection works, and it pauses every shape when the app
  leaves the screen.** Electric falls back to `document.visibilitychange`, and
  the WebView marks the page hidden when its window stops being visible. Hidden
  pages get Chromium's background timer throttling, and an app with no
  foreground service is frozen ten seconds after it becomes cached on Android
  14 and later.

## Persistence

### The adapter at `@tanstack/db` 0.11.0

Read from the 0.2.25 source
([`capacitor-persistence.ts`](https://unpkg.com/@tanstack/capacitor-db-sqlite-persistence@0.2.25/src/capacitor-persistence.ts),
[`capacitor-sqlite-driver.ts`](https://unpkg.com/@tanstack/capacitor-db-sqlite-persistence@0.2.25/src/capacitor-sqlite-driver.ts),
[`README.md`](https://unpkg.com/@tanstack/capacitor-db-sqlite-persistence@0.2.25/README.md)):

- `createCapacitorSQLitePersistence({ database })` takes an
  `SQLiteDBConnection` the app has already created and opened. One instance is
  shared by every collection, as the Expo and Electron wrappers do.
- The driver sends every statement with the plugin's own transaction flag off
  (`execute(sql, false)`, `run(sql, params, false)`) and runs its own
  transactions as `BEGIN IMMEDIATE` ... `COMMIT`, with savepoints for nesting.
  Every call goes through one promise queue inside the driver.
- The driver is not exported. The package's `exports` map has `.` and
  `./capacitor`, and neither names `createCapacitorSQLiteDriver`
  ([`index.ts`](https://unpkg.com/@tanstack/capacitor-db-sqlite-persistence@0.2.25/src/index.ts)).
- The README says to use the browser or Electron packages for the plugin's web
  and Electron modes, so this package is for the native Android and iOS
  runtimes only. It names an Android e2e harness run against an emulator.
- Rows, tombstones, the `electric:resume` state and the absence of row pruning
  are core's, as the persistence note on the map describes. Core 0.4.0 creates
  its shared tables under fixed names: `collection_registry`,
  `persisted_index_registry`, `applied_tx`, `collection_version`,
  `collection_expected_keys`, `collection_metadata`, `leader_term` and
  `schema_version`
  ([`sqlite-core-adapter.ts`](https://unpkg.com/@tanstack/db-sqlite-persistence-core@0.4.0/src/sqlite-core-adapter.ts)).

### The plugin

Read from `@capacitor-community/sqlite` 8.1.1's Android source
([`Database.java`](https://unpkg.com/@capacitor-community/sqlite@8.1.1/android/src/main/java/com/getcapacitor/community/database/sqlite/SQLite/Database.java),
[`CapacitorSQLite.java`](https://unpkg.com/@capacitor-community/sqlite@8.1.1/android/src/main/java/com/getcapacitor/community/database/sqlite/CapacitorSQLite.java),
[`build.gradle`](https://unpkg.com/@capacitor-community/sqlite@8.1.1/android/build.gradle)):

- The file is `context.getDatabasePath(name + "SQLite.db")`, which is
  `/data/data/<package>/databases/`. It is opened through SQLCipher for Android
  4.17.0, encrypted or not. Foreign keys are switched on at open. I found no
  `journal_mode` or `enableWriteAheadLogging` call, so the file runs in
  SQLite's default rollback journal unless the app sends a `PRAGMA`.
- One connection per database name and mode: `createConnection` throws
  "Connection ... already exists" for a second read-write connection to the
  same name.
- Connections live in a map on the plugin instance, and the plugin has no
  `handleOnDestroy`. When Capacitor rebuilds its plugins, which renderer
  recovery does, the old connection is neither closed nor reachable.
- Every Capacitor plugin call on Android runs on one `HandlerThread` named
  `CapacitorPlugins`
  ([`Bridge.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/Bridge.java),
  `execute` posts to it). A long SQLite statement delays every other plugin
  call queued behind it, the secure storage and geolocation plugins included.
  Results cross into the page as JSON. No source I found measures what that
  costs when hydrating a large eager collection; a device timing of
  `hydrateBaseline` over the largest collection would settle it.

### One file per Account and Organization

#1345 requires the queue, Tracks and TanStack's rows in one file per Account
and Organization. Read against the adapter, that works with three conditions:

1. **App tables must not reuse core's names**, which is easy: `command_queue`
   and `track_point` collide with nothing in the list above.
2. **App writes cannot go out on the adapter's connection beside the
   adapter.** The driver's queue serialises only the driver's own calls. A
   queue insert sent on the same `SQLiteDBConnection` while the driver is
   between its `BEGIN IMMEDIATE` and `COMMIT` runs inside TanStack's
   transaction, and a TanStack rollback takes it with it. A second read-write
   connection to the same name is refused by the plugin. The way out I can see
   in source is to skip the Capacitor package and write the driver ourselves:
   core exports `createSQLiteCorePersistenceAdapter` and the `SQLiteDriver`
   interface, and the Capacitor driver is about 300 lines. The queue and Track
   code then share the same driver and the same serial queue, and every write
   is ordered with TanStack's. The other way is to file the export upstream.
3. **A native writer needs its own connection and a lock plan.** If the Track
   recorder is native and writes fixes while the page is dead (see Renderer
   death), it opens the file from Kotlin or Java as a second connection.
   SQLite allows that, but under the rollback journal a writer and a reader
   block each other, so the file wants `PRAGMA journal_mode = WAL` and both
   sides want a busy timeout. If the file is encrypted, the native writer
   needs the same SQLCipher key.

### OPFS in the page instead

`@tanstack/browser-db-sqlite-persistence` 0.2.25 runs `wa-sqlite` with
`OPFSCoopSyncVFS` in a dedicated worker
([`opfs-worker.ts`](https://unpkg.com/@tanstack/browser-db-sqlite-persistence@0.2.25/src/opfs-worker.ts)).
MDN's compatibility data gives `createSyncAccessHandle` to Android WebView 109
(`@mdn/browser-compat-data` 8.1.4, 2026-10-01). Against the native plugin:

- **Only the page can reach the file.** A native Track recorder cannot write
  to it, so fixes recorded while the page is dead have to be buffered
  somewhere else and copied in later, which is a second store.
- **It is best-effort storage.** The WebView answers a
  `navigator.storage.persist()` request with `DENIED`: `PERSISTENT_STORAGE` is
  in the group `AwPermissionManager::RequestPermissions` marks
  `NOTIMPLEMENTED` and denies
  ([`aw_permission_manager.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_permission_manager.cc)).
  MDN lists `persist()` as supported in WebView 55, which is true of the method
  and not of the answer. WebView also returns no special storage policy
  ([`aw_browser_context.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_browser_context.cc),
  `GetSpecialStoragePolicy` returns `NULL`), so nothing marks the origin
  unlimited.
- **Chromium may evict it under disk pressure.** The quota settings keep a
  "must remain available" reserve, the smaller of 1 GB and 1% of the disk, and
  the comment says "Data will be aggressively evicted" below it
  ([`quota_settings.cc`](https://github.com/chromium/chromium/blob/main/storage/browser/quota/quota_settings.cc)).
  I found nothing in `android_webview/` that turns eviction off. On a 64 GB
  phone that is about 640 MB free. I did not confirm on a device that the
  WebView's quota manager runs eviction, so this is my reading of shared
  Chromium code, not an observed loss.

### What Android evicts

The SQLite file is safe from everything but the user. Android "may delete"
files in the cache directory when internal storage is low, and app-specific
files outside it are removed when the app is uninstalled
([App-specific storage](https://developer.android.com/training/data-storage/app-specific),
updated 2026-10-01). The `databases` directory is not cache. The user's own
"Clear storage" in Settings wipes it, along with everything else.

**Auto Backup copies it.** Auto Backup includes shared preferences, files
under `getFilesDir()` and `getDir()`, and database files from
`getDatabasePath()` by default, up to 25 MB per app, and excludes only the
cache, code cache and no-backup directories
([Auto Backup](https://developer.android.com/identity/data/autobackup), updated
2026-02-26). Left on, a phone uploads the Organization's rows and the queued
commands to the user's Google Drive and restores them on a new phone, where the
Keystore key that encrypts the bearer does not exist. The app should exclude the
database and the secure storage preferences in `dataExtractionRules` (Android
12 and later) and `fullBackupContent` (11 and earlier), or set
`android:allowBackup="false"`. The WebView's own directory is created with
`getDir()`, so OPFS data there would be in scope too; I did not check whether
the WebView excludes it.

## Background location

### What Android requires

- A foreground service of type `location` declares
  `FOREGROUND_SERVICE_LOCATION` in the manifest and needs location services on
  and `ACCESS_COARSE_LOCATION` or `ACCESS_FINE_LOCATION` granted. "You cannot
  create a `location` foreground service while your app is in the background,
  unless you've been granted the `ACCESS_BACKGROUND_LOCATION` runtime
  permission"
  ([Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types),
  updated 2026-10-01). So a Track started from a tap in the app needs only
  while-in-use permission, and a Track that restarts itself after the service
  is killed while the app is in the background needs background permission.
- The service shows a notification for as long as it runs. Android 13 and
  later need `POST_NOTIFICATIONS` granted to show it; every plugin below
  declares that permission.
- A foreground service keeps the app out of the cached state, and the cached
  apps freezer only freezes cached processes: from Android 14 "automatic
  freezing 10 seconds after entering cached state"
  ([Cached apps freezer](https://source.android.com/docs/core/perf/cached-apps-freezer),
  updated 2026-09-29). A foreground service does not exempt the app from
  Doze, which suspends network access and ignores wake locks while the device
  is stationary and unplugged
  ([Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby),
  updated 2026-08-18). A crew member walking a route keeps the phone moving.
  How often a phone in a truck cab reaches Doze is a device question.
- `navigator.geolocation` cannot record a Track in the background. Blink stops
  geolocation for a hidden page
  ([`geolocation.cc`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/geolocation/geolocation.cc)),
  and `AwContents.onPause` says "Geolocation is paused/resumed via the page
  visibility mechanism"
  ([`AwContents.java`](https://github.com/chromium/chromium/blob/main/android_webview/java/src/org/chromium/android_webview/AwContents.java)).
  A native foreground service is the only way. I did not read
  `@capacitor/geolocation` 8.2.3's source; none of the three plugins below
  depends on it.

### The plugins

| | `@capgo/background-geolocation` 8.4.7 | `@capacitor-community/background-geolocation` 1.2.26 | Transistorsoft 9.6.0 |
| --- | --- | --- | --- |
| Source read | [Android source](https://unpkg.com/browse/@capgo/background-geolocation@8.4.7/android/src/main/java/com/capgo/capacitor_background_geolocation/) | [Android source](https://unpkg.com/browse/@capacitor-community/background-geolocation@1.2.26/android/src/main/java/com/equimaps/capacitor_background_geolocation/) | README and docs only |
| Location provider | `LocationManager` GPS, with network fixes dropped unless GPS has been silent and the fix is precise | Fused provider, `PRIORITY_HIGH_ACCURACY`, through the deprecated `new LocationRequest()` | the docs say motion detection switches GPS off when still |
| Service | `foregroundServiceType="location"`, not exported, partial wake lock, 60 s watchdog that restarts updates | `foregroundServiceType="location"`, **exported**, `startForeground` without a type | yes |
| Where a fix goes | to JavaScript through an in-process bus that "drops events when nothing is listening"; optionally a native POST to one URL with no retry | to JavaScript only | its own SQLite, "persist-first", then its HTTP service ([docs](https://transistorsoft.github.io/cordova-background-geolocation-lt/interfaces/config.html)) |
| On plugin destroy | stops the service unless native POST is configured | `handleOnDestroy` calls `service.stopService()` | not read; its docs describe tracking after the app is terminated |
| Cost | free, MIT | free, MIT | "A license is required for RELEASE builds on both iOS and Android" ([README](https://github.com/transistorsoft/capacitor-background-geolocation)) |

Read with renderer death in mind, the two free plugins lose fixes in exactly
the window the field loop needs them: while the page is dead, nothing listens,
and Capgo's `handleOnDestroy` stops the service outright when the activity is
recreated. Capgo's native POST does not help offline, since it sends one
request per fix and drops it on failure.

Transistorsoft is the only one built for this, and it stores fixes in a SQLite
file of its own, not ours. It also wants an empty buffer ("the SDK
**strongly** desires an *empty* database", per its docs) and defaults to
keeping a fix one day. So the Track would still be copied from its file into
the per-Account file once the page is alive, and nothing in its docs says how
that file is scoped across an Organization switch.

The other option is ours: a small Kotlin foreground service, started and
stopped by a two-method plugin, that writes each fix straight into the
per-Account file's `track_point` table on its own connection (condition 3
above). The page reads Tracks from the table and never sees a fix as an event.
That is the shape that survives renderer death without a second store. It is
code SIMMER would own, and no source I found ships it.

### Play policy

- Play's location policy allows a foreground service when its use "has been
  initiated as a continuation of an in-app user-initiated action, and is
  terminated immediately after the intended use case of the user-initiated
  action is completed by the application"
  ([Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/16558241)).
  A Track started by a tap and ended by a tap is that shape.
- `ACCESS_BACKGROUND_LOCATION` needs the Play Console permissions declaration,
  a video of 30 seconds or less, a prominent disclosure before the permission
  prompt, and a privacy policy
  ([background location requirements](https://support.google.com/googleplay/android-developer/answer/9799150);
  no date shown). The page also says Play "can approve an app's use of
  foreground service" and that location after the user leaves the app is
  background access by Play's definition, which reads as though a location
  service may be reviewed as background location even without the permission.
  The page does not settle that.
- Apps targeting Android 14 and later declare each foreground service type in
  Play Console with a description, the user impact of a deferred or
  interrupted task, and a video
  ([foreground service requirements](https://support.google.com/googleplay/android-developer/answer/13392821)).
- **Internal distribution.** A private app on managed Google Play is
  "automatically approved for distribution" to the organizations it names, up
  to 1,000 of them
  ([Distribute private apps](https://support.google.com/googleplay/work/answer/9495634)).
  No page I found says whether a private app goes through the location or
  foreground service declarations, or whether an internal testing track is
  reviewed differently from production. This is the thinnest part of the
  note.
- **Outside Play.** Android developer verification starts on 2026-09-30 for
  certified devices in Brazil, Indonesia, Singapore and Thailand and goes
  global in 2027, covering apps installed from outside Play as well
  ([developer verification](https://developer.android.com/developer-verification)).
  An APK side-loaded or pushed by an EMM still needs a verified developer
  once that reaches the US. The page names no exemption for managed devices.

## Session

### Where the bearer lives

- `@aparajita/capacitor-secure-storage` 8.0.1 generates one AES-GCM key per
  stored key in `AndroidKeyStore` and keeps the ciphertext in a private
  `SharedPreferences` file
  ([`SecureStorage.java`](https://unpkg.com/@aparajita/capacitor-secure-storage@8.0.1/android/src/main/java/com/aparajita/capacitor/securestorage/SecureStorage.java)).
  It does not request StrongBox or user authentication, so the key is
  hardware-backed where the phone's Keystore is, and usable without a
  fingerprint.
- `capacitor-secure-storage-plugin` 0.13.0 uses an RSA key pair with PKCS#1
  padding and also keeps a `SharedPreferences` file
  ([`PasswordStorageHelper.java`](https://unpkg.com/capacitor-secure-storage-plugin@0.13.0/android/src/main/java/com/whitestein/securestorage/PasswordStorageHelper.java)).
  AES-GCM is the better primitive for a token that rotates.
- Either one is three async calls, which is the shape `SessionTransport` in
  `packages/auth` already has (`read`, `write`, `clear`), so a transport over
  the plugin is the same seam the Electron note describes.
- `@capacitor/preferences` stores plain `SharedPreferences` and is not a place
  for the bearer.
- Both plugins' preference files are in Auto Backup's default scope. The
  ciphertext restores to a new phone without its key and fails to decrypt,
  which is a sign-in prompt and not a leak, but excluding it is cleaner.
- Capacitor's plugin thread is shared (see Persistence), so a `read` of the
  bearer queues behind any SQLite call already in flight.

### Whether the cookie rides at all

- Capacitor serves the app from `https://localhost` by default
  (`server.androidScheme` `https`, `server.hostname` `localhost`;
  [`CapConfig.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/CapConfig.java),
  [config docs](https://capacitorjs.com/docs/config)). That is a secure
  context, so `crypto.randomUUID` exists for TanStack DB.
- Capacitor always builds its Cordova shim, and the shim calls
  `CookieManager.setAcceptThirdPartyCookies(webView, true)`
  ([`CapacitorCordovaCookieManager.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/cordova/CapacitorCordovaCookieManager.java),
  constructed from `MockCordovaWebViewImpl` in `Bridge.Builder`). So the
  WebView itself would store and send a third-party cookie.
- The server sets the session cookie `SameSite: 'Lax'`
  (`apps/server/src/auth/session-transport/write-sealed-session.ts`).
  `https://localhost` and `https://api.simmer-data.com` are different sites,
  and a Lax cookie goes cross-site only on a top-level navigation with a safe
  method, so no `fetch` from the page carries it, and a `Set-Cookie` on a
  `fetch` response is not stored. This is the same answer the Electron note
  reached for a custom scheme, by the same rule.
- #1345 has the server ignore a token client's cookie anyway, so nothing
  depends on this, but it means a cookie cannot be the fallback.
- **CORS.** The server must admit `https://localhost`. `appOrigins` is
  `APP_ORIGIN` plus `ADMIN_APP_ORIGIN` today (`apps/server/src/env.ts`), the
  same gap the Electron note found. Admitting `https://localhost` in
  production admits any page a developer serves on `https://localhost`, which
  is a narrower exposure than it sounds, since the request still needs a
  bearer, but `server.hostname` can be changed to a name of SIMMER's own if
  that matters.

## Renderer death

### What Capacitor and Android do

- `BridgeWebViewClient.onRenderProcessGone` asks every registered
  `WebViewListener` and returns `true` if any listener did
  ([`BridgeWebViewClient.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java)).
  With no listener it returns `false`, and the app process is killed.
- Android's docs: a WebView whose renderer is gone "can't be reused"; the app
  "must remove the instance from the view hierarchy and destroy the instance"
  and create a new one. `didCrash()` is `false` when the system killed the
  renderer to reclaim memory and `true` for a real crash
  ([Managing WebView objects](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview),
  updated 2026-08-25).
- `Bridge` holds its WebView in a `final` field, so a listener cannot hand the
  live bridge a new WebView. Recovery means rebuilding the bridge, which means
  recreating the activity.
- Capacitor leaves the renderer at its default priority: it never calls
  `setRendererPriorityPolicy`, and `AwContents` starts at `HIGH` with
  "waived when not visible" off, which binds the renderer `IMPORTANT`
  whether or not it is visible (`updateChildProcessImportance` in
  `AwContents.java`). So the renderer shares the app process's importance, and
  a running foreground service protects it too. That makes `didCrash: false`
  less likely during a Track, not impossible.

### `@capgo/capacitor-webview-crash` against a hand-written listener

Read from 8.1.10
([`WebViewCrashPlugin.java`](https://unpkg.com/@capgo/capacitor-webview-crash@8.1.10/android/src/main/java/app/capgo/webviewcrash/WebViewCrashPlugin.java)):

- It registers its listener in `handleOnStart`, returns `true`, writes the
  reason, URL, `didCrash` and `rendererPriorityAtExit` to `SharedPreferences`,
  then on the main thread calls `bridge.reset()` and `activity.recreate()`.
  The restarted page can read the record and gets a
  `webViewRestoredAfterCrash` event.
- `bridge.reset()` drops saved plugin calls and every plugin's listeners
  ([`Bridge.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/Bridge.java)).
  `recreate()` runs `BridgeActivity.onDestroy`, which calls every plugin's
  `handleOnDestroy` and quits the plugin thread with `quitSafely`.
- It also offers a periodic restart on an interval or a cron expression, which
  SIMMER does not need.

A hand-written listener would end in the same `recreate()`. What it buys is
control of the order: it can tell native code the page is gone before the
plugins are destroyed, and it can skip the restart for a `didCrash: true`
loop. The plugin is about 150 lines of Java over a small helper, so copying its
shape into the app's own `MainActivity` costs little and removes a dependency
whose listener registers late (`handleOnStart`, not `load`). Either works; the
plugin is a fine reference and a thin base.

### What has to survive

Recreating the activity reloads the page, so nothing in JavaScript memory
survives. For the field loop that means:

- **The queue.** TanStack's persistence stores rows the source has applied, in
  `sync-present` mode, not optimistic state. A command the user saved and the
  server has not confirmed exists only in the queue table, so the save must not
  report success until the queue insert has committed. On restart the page
  reopens the file, hydrates, and replays the queue as optimistic mutations.
- **The open transaction.** SQLite itself is in the app process, not the
  renderer, so committed writes survive and the file is not corrupted by
  renderer death. But TanStack's `BEGIN IMMEDIATE`, statements and `COMMIT`
  are separate plugin calls. If the renderer dies between them, the old plugin
  instance's connection is left open and mid-transaction, the new plugin
  instance cannot see it, and its reserved lock blocks every write the new
  connection tries. I read this from the source above and did not reproduce
  it. A hand-written listener is the natural place to close every connection
  before `recreate()`; closing a connection with an open transaction rolls it
  back.
- **The Track.** A recording Track must keep recording through the restart,
  which rules out a recorder owned by a plugin instance (Capgo stops its
  service in `handleOnDestroy`) and argues for the native writer described
  under Background location. The restarted page learns a Track is recording
  by reading it from SQLite.

## WebView floor

### What the app needs

| Need | Chromium | Source |
| --- | --- | --- |
| `apps/web` bundle | 111 | Vite 8's default `build.target`, `baseline-widely-available`, is `chrome111` ([build options](https://vite.dev/config/build-options)); `apps/web/vite.config.ts` does not override it |
| MapLibre GL JS 6.11.2 syntax | 94 | the build targets ES2022 and a test asserts the bundle needs no downlevelling; it uses class static blocks (94), `#x in` (91), `Object.hasOwn` (93) and `.at()` (92) (read in `dist/`, versions from browser-compat-data) |
| MapLibre GL JS 6 rendering | WebGL2 | "WebGL (v1) support has been removed; WebGL2 is now required" ([CHANGELOG at v6.11.2](https://github.com/maplibre/maplibre-gl-js/blob/v6.11.2/CHANGELOG.md)) |
| TanStack DB 0.11.0 | 93 | `Object.hasOwn`, `.at()`, `crypto.randomUUID` (92, secure context only); read in `dist/esm` |
| OPFS persistence, if used | 109 in WebView | `createSyncAccessHandle` per browser-compat-data |

maplibre-gl-js#8157 (opened 2026-08-12, closed 2026-08-14) is a Huawei WebView
11.1.2 on Chromium 88 drawing an empty map from 5.23.0 on. The maintainer's
answer was that v6 is WebGL2 only and "We don't have plans to support old
browsers." A Chromium 88 page would not reach MapLibre at all on SIMMER's
bundle, because Vite's Chrome 111 output fails to parse first.

The floor is therefore 111 unless `apps/web` sets a lower `build.target` for the
field build, and 94 is the lowest that can be reached without transpiling
MapLibre. Nothing in what I read needs more than 111.

### How Capacitor checks it

Read in `Bridge.isMinimumWebViewInstalled` and `loadWebView`:

- On Android 8 and later it reads `WebView.getCurrentWebViewPackage()`, takes
  the first number in `versionName`, and compares it with
  `android.minWebViewVersion` (default 60, never below 55).
- For the package `com.huawei.webview` it compares that number with
  `android.minHuaweiWebViewVersion` (default 10) instead. Huawei's number is
  Huawei's own, 11 on the #8157 device, so a Chromium floor of 111 does not
  reach it, and no source I found maps Huawei versions to Chromium.
- **When the check fails and `server.errorPath` is unset, Capacitor logs
  "System WebView is not supported" and loads the app anyway.** It refuses
  only by loading the error page, and that page "won't have access to
  Capacitor plugins" ([config docs](https://capacitorjs.com/docs/config)).
- Android's docs warn `getCurrentWebViewPackage()` "can return `null`" on a
  device set up incorrectly or without an updatable WebView.

So the refusal needs three parts: `android.minWebViewVersion: 111` with
`server.errorPath` pointing at a static page that says to update Android
System WebView, and a classic (non-module) inline script in `index.html` that
reads `Chrome/NNN` from `navigator.userAgent` and shows the same message
before the module bundle loads. The script covers Huawei and any WebView
package Capacitor does not recognise. WebView updates come through Play, so a
phone without Play services cannot be fixed by the user.

## Visibility

### What Electric does in the WebView

Read in `@electric-sql/client` 1.5.28
([`client.ts`](https://unpkg.com/@electric-sql/client@1.5.28/src/client.ts)),
which matches what the Electron note read in 1.5.23:

- With no `runtimeVisibility` option and no default adapter (only the React
  Native entry installs one), the stream subscribes to
  `document.visibilitychange` whenever `document.hidden` is a boolean, which
  it is in a WebView.
- Going hidden takes a `visibility` pause lock, which aborts the in-flight
  request with `PAUSE_STREAM`. Becoming visible again restarts with a
  catch-up request that is not a live long poll.
- The wake-from-sleep timer only runs where there is no visibility API, so it
  does not run here.

### What the WebView reports

- `AwContents.updateWebContentsVisibility` hides the web contents whenever
  the view or its window is not visible or the WebView is paused, and that is
  what drives `document.visibilityState`
  ([`AwContents.java`](https://github.com/chromium/chromium/blob/main/android_webview/java/src/org/chromium/android_webview/AwContents.java)).
  When the activity stops, its window stops being visible, so the page goes
  hidden whether or not anyone calls `WebView.onPause()`.
- Capacitor does not pause JavaScript timers by default. Its Cordova shim
  calls `pauseTimers()` only when the `KeepRunning` preference is false, and
  that preference defaults to true
  ([`MockCordovaWebViewImpl.java`](https://unpkg.com/@capacitor/android@8.5.2/capacitor/src/main/java/com/getcapacitor/cordova/MockCordovaWebViewImpl.java),
  `Bridge.shouldKeepRunning`).
- So auto-detection works: the moment the app leaves the screen, every shape
  stops. That is the right behaviour for battery and the same switch that
  stops Blink geolocation.

### What happens to timers and requests while hidden

- A hidden page gets Chromium's background throttling, the same scheduler as
  Chrome. I found no override of the intensive wake-up throttling feature in
  WebView's feature list
  ([`aw_field_trials.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_field_trials.cc)),
  so chained timers in a page hidden for minutes fire about once a minute. I
  did not confirm the WebView's exact budget on a device.
- Without a foreground service the app becomes cached once it leaves the
  screen, and on Android 14 and later the freezer stops it ten seconds later.
  A command POST in flight then either completes later or times out on the
  server's side. With a foreground service running, the app is not cached and
  the renderer, bound `IMPORTANT`, keeps running.
- Doze suspends network access whatever the page does.

### What that means for the queue

Commands are confirmed through Electric (`awaitTxId`), and Electric is paused
while hidden. A command the queue sends from a hidden page reaches the server
but cannot be confirmed until the page is visible again, and `awaitTxId`'s
15-second default will fail it first. Two consistent options: drain the queue
only while visible, or hand `packages/sync` a `runtimeVisibility` adapter that
reports visible while a Track's foreground service is running, which
`alwaysVisibleRuntime` already proves the seam for. The second costs battery
for every shape the app holds.

## Open

- Whether a private app on managed Google Play goes through the background
  location and foreground service declarations. No page says either way.
- Whether Play reviews a `location` foreground service started from a tap as
  background location when `ACCESS_BACKGROUND_LOCATION` is not requested.
- Whether Chromium's quota manager evicts OPFS data inside the WebView under
  disk pressure. Read in shared code, not observed.
- Whether an orphaned connection left mid-transaction by renderer death blocks
  the next connection's writes on a device, and whether closing connections in
  the listener before `recreate()` clears it.
- How `activity.recreate()` behaves when called while the activity is stopped
  behind a foreground service notification.
- The cost of hydrating the largest eager collection through the plugin's JSON
  bridge on a low-end phone, and how long that holds the shared plugin thread.
- How often a phone riding in a truck reaches Doze during a working day, which
  decides whether background command drains are worth designing for.
- Whether the WebView's `app_webview` directory is in Auto Backup's scope.
- Whether TanStack will export the Capacitor driver, which decides between a
  hand-written driver and an upstream change.

### What a phone has to show

1. With the native plugin and 0.11.0, a persisted Electric collection
   reloads offline after the process is killed, and its row count matches.
2. With a Track recording behind its notification, killing the WebView's
   sandboxed renderer process with `adb shell kill` recovers to the same
   screen, the Track has no gap beyond the restart, and a queued command is
   still queued. Do it once mid-transaction as well.
3. On Android 14 and 15, starting the Track from a tap with only
   while-in-use permission works, and restarting the service from the
   background without background permission fails as the docs say.
4. `document.visibilityState` and Electric's paused state logged beside each
   fix while the screen is off.
5. On a WebView below the floor, the error page appears, and on a Huawei
   WebView the inline script refuses.

## Sources

- npm registry packuments and published source on unpkg, read 2026-10-02, at
  the versions in the first table.
- TanStack DB
  [SQLite persistence guide](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md)
  and [TanStack/db#1820](https://github.com/TanStack/db/issues/1820), which
  lists Capacitor device runs among open native test gaps.
- Capacitor [config docs](https://capacitorjs.com/docs/config) and the
  `@capacitor/android` 8.5.2 source: `Bridge.java`, `BridgeActivity.java`,
  `BridgeWebViewClient.java`, `WebViewListener.java`, `CapConfig.java`,
  `cordova/MockCordovaWebViewImpl.java`,
  `cordova/CapacitorCordovaCookieManager.java`.
- Chromium at `main`:
  [`aw_permission_manager.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_permission_manager.cc),
  [`aw_browser_context.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_browser_context.cc),
  [`AwContents.java`](https://github.com/chromium/chromium/blob/main/android_webview/java/src/org/chromium/android_webview/AwContents.java),
  [`aw_field_trials.cc`](https://github.com/chromium/chromium/blob/main/android_webview/browser/aw_field_trials.cc),
  [`quota_settings.cc`](https://github.com/chromium/chromium/blob/main/storage/browser/quota/quota_settings.cc),
  [`geolocation.cc`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/geolocation/geolocation.cc).
- `@mdn/browser-compat-data` 8.1.4 (2026-10-01) for Chromium and WebView
  versions.
- MapLibre GL JS
  [CHANGELOG at v6.11.2](https://github.com/maplibre/maplibre-gl-js/blob/v6.11.2/CHANGELOG.md),
  `test/build/es2022-compat.test.ts`, and
  [maplibre-gl-js#8157](https://github.com/maplibre/maplibre-gl-js/issues/8157).
- Vite [build options](https://vite.dev/config/build-options) (v8 docs).
- Android:
  [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types),
  [background location](https://developer.android.com/develop/sensors-and-location/location/background),
  [managing WebView objects](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview),
  [app-specific storage](https://developer.android.com/training/data-storage/app-specific),
  [Auto Backup](https://developer.android.com/identity/data/autobackup),
  [Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby),
  [cached apps freezer](https://source.android.com/docs/core/perf/cached-apps-freezer),
  [developer verification](https://developer.android.com/developer-verification).
- Google Play:
  [sensitive permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241),
  [background location requirements](https://support.google.com/googleplay/android-developer/answer/9799150),
  [foreground service requirements](https://support.google.com/googleplay/android-developer/answer/13392821),
  [private apps on managed Google Play](https://support.google.com/googleplay/work/answer/9495634).
- Transistorsoft
  [README](https://github.com/transistorsoft/capacitor-background-geolocation)
  and [Config docs](https://transistorsoft.github.io/cordova-background-geolocation-lt/interfaces/config.html).
- In this repo: `apps/server/src/auth/session-transport/write-sealed-session.ts`,
  `apps/server/src/env.ts`, `packages/sync/src/collections/functions/sync-collection.ts`,
  `packages/auth/src/client/`, `apps/web/package.json`, ADR 0016.
