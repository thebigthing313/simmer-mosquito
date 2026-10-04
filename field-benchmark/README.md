# Field benchmark

Throwaway app for [Benchmark the field app's budgets on a real phone](https://github.com/thebigthing313/simmer-mosquito/issues/1352). It is not the field app and is never merged. One web build runs in three places: Capacitor on Android, Electron on Windows, and the Vite dev page in a desktop browser for checking the instruments.

What it loads is the prod clone's eager set: 15,321 Habitats, 9,816 Addresses, 417 Traps, 345 Regions simplified to 5 m, 112 routes and 14,249 route items, each a TanStack DB collection over the shell's SQLite persistence, plus the command queue as a local-only persisted collection (#1363). The map is MapLibre GL JS over a zoom 15 Protomaps file through the shell's range-read `Source` (#1359), with Habitats and Addresses clustered and the longest route as numbered pins.

**`data/` holds customer data.** Git ignores it. Never commit it or upload it anywhere public.

## Setting up on the PC

```sh
npm install
node scripts/export-data.mjs       # needs the compose Postgres on 127.0.0.1:55432
sh scripts/cut-basemap.sh          # needs data/tools/pmtiles.exe from go-pmtiles
sh scripts/fetch-map-assets.sh     # glyphs and sprites into public/map-assets
node scripts/serve.mjs             # leave running during the device passes
```

`serve.mjs` prints the PC's LAN addresses. The app defaults to `http://192.168.1.213:8787`; change it in the Bench panel if the PC's address differs. Windows Firewall has to let the device reach TCP 8787 on the PC (allow Node.js on private networks when Windows asks, or add an inbound rule for the port).

Builds:

```sh
npm run build:android    # android/app/build/outputs/apk/debug/app-debug.apk
npm run build:electron   # release/Field benchmark Setup 0.0.1.exe
```

## What each button measures

| Button | Graded bar | Notes |
| --- | --- | --- |
| 1. First sync | under two minutes on Wi-Fi; disk under 150 MB | Fetches every table in parallel from the LAN server and writes it in pages of 1,000 rows. The wire is gzip JSON, lighter than Electric's shape log, so the download half is a floor; the write half is the real persistence path. Android also logs how many SQLite plugin calls the write took |
| 2. Download basemap | file 100 MB or less | 28.7 MB for the prod clone's box. Reloads the app onto the local file |
| 3. Record heap | 250 MB or less | `performance.memory` is not usable in the Android WebView. The graded number is a DevTools heap snapshot, see below |
| 4. Pan run (graded) | per device, see the ticket | 30 s scripted camera over the county with regions on and clustering on |
| 5. Pan run, unclustered | recorded | Same path without clustering |
| 6. Unclustered sweep | recorded | 10k to 150k points, 12 s each, stops when the median falls under 20 fps |
| No breeding (stop card) | per device | Tap it by hand 20 times or more, then 7. Log tap summary. Each tap is timed from the touch to the frame after the pins redraw |
| 8. Replay GPX | 5,000 vertices or fewer, no frame over 50 ms | Replays a GPX at 60 times real time, redrawing the Track once a second |
| 9, 10. Kill renderer | back on the map within 10 s, no Queued command lost | Android only. Crash gives `didCrash: true`, kill gives `false` |
| 11. Kill mid-write | same, and a save after recovery persists | A sync rewrite and a burst of saves in flight when the renderer dies |
| Cold start | per device | Logged on every launch as `cold-start`. Only a launch from a force-stopped app with data on disk counts |

Every result is one JSON line in the results file. Share results sends the whole file through the Android share sheet; on Windows it copies the file to the clipboard and opens its folder (`%APPDATA%\field-benchmark\bench-results.jsonl`). On Android the file is also at `Android/data/com.simmerdata.fieldbench/files/bench-results.jsonl`.

## Checklist: Pixel 9 Pro (and a borrowed customer phone)

Record a GPX before this pass: about two hours of real driving on the Pixel with any logger that exports GPX (GPSLogger works). Copy the file onto the phone.

1. On the phone: Settings, Apps, Special app access, Install unknown apps, allow your file manager or browser. Turn on Developer options and USB debugging.
2. Copy `app-debug.apk` to the phone and install it. Keep the phone on the same Wi-Fi as the PC and keep `serve.mjs` running.
3. Open the app, open Bench, check the LAN server address, tap **1. First sync**. Wait for the status line to give a time and a database size.
4. Tap **2. Download basemap**. The app reloads; Bench should say "Basemap: local file, 28.7 MB".
5. Heap: plug the phone into the PC, open `chrome://inspect` in Chrome on the PC, click inspect under the app, open the Memory tab, take a heap snapshot, and note the total in the left column. Then tap **3. Record heap** and type that total into the share message or the ticket comment.
6. Unplug, swipe the app away from recents, open it again, and wait for the map. Do that three times; each launch logs `cold-start`.
7. Tap **4. Pan run (graded)** twice, then **5** once, then **6**. Don't touch the screen while they run.
8. Tap **No breeding** 20 times at a normal pace, then **7. Log tap summary**.
9. Tap **8. Replay GPX** and pick the drive.
10. Save five or so results first, then tap **9**, wait for the map, then **10**, wait, then **11**, wait. Each recovery logs `renderer-recovered` with `pass` true or false.
11. Optional, recorded only: with the map loaded, open the camera and a few heavy apps, come back, and note whether the app reloaded.
12. Tap **Share results** and send the file to yourself.

## Checklist: Surface Pro 7

1. Copy `Field benchmark Setup 0.0.1.exe` over and run it. It installs per user with no admin prompt; SmartScreen will warn because it is unsigned, so choose More info, Run anyway.
2. If the Surface can reach `serve.mjs` on the PC, do steps 3 and 4 of the Pixel list. If it cannot, run `serve.mjs` on a laptop on the Surface's network with a copy of `data/`.
3. Heap: press F12 for DevTools, Memory tab, heap snapshot, note the total, then **3. Record heap**.
4. Close the window, reopen from the Start menu, three times, for cold start.
5. Steps 7 and 8 of the Pixel list. The Track and the renderer kill are not on the Windows list.
6. **Share results** opens the folder holding `bench-results.jsonl`; send that file.

## Known gaps

- The first sync downloads a gzip JSON bundle rather than Electric shapes, so it is a lower bound on the network half.
- The heap number is the page's main thread. MapLibre's workers hold their own copies of the GeoJSON and are not in it.
- The APK is a debug build so DevTools can attach. The JavaScript and the WebView are the same as in a release build; Capacitor's bridge logging is off so it does not skew SQLite timing.
- The emulator numbers in the ticket comment are a smoke test of the instruments, not a measurement.
