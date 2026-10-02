# Which fetch the field app hands to Electric and the command queue

Status: Current. About work that is not built: `apps/mobile` does not depend on
`@simmer-mosquito/sync` yet.

Research for
[Research: which fetch the field app hands to Electric and the command queue](https://github.com/thebigthing313/simmer-mosquito/issues/1344),
part of [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
It follows
[docs/research/mobile-electric-shapes.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-electric-shapes/docs/research/mobile-electric-shapes.md)
(#1332), which found the `expo/fetch` body-read defects and left the choice open.

Checked on 2026-10-02. Every claim about a library was read from its published
npm tarball, its repository at a release branch or tag, or its own docs, and the
link is given. Line numbers are from the tarball named. Where something needs a
device, I say so.

## Versions in play

| Package | Version | Where it comes from |
| --- | --- | --- |
| `expo` | `~57.0.12` in `apps/mobile/package.json`, 57.0.17 in the lockfile; 57.0.26 is the newest 57 | npm `sdk-57` and `latest` tags |
| `expo` 58 | 58.0.0 published 2026-09-29, 58.0.2 on 2026-10-01 | npm `next` tag; `latest` is still 57.0.26 |
| `react-native` | 0.86.3 | `apps/mobile/package.json` |
| `whatwg-fetch` | 3.6.20 | lockfile; React Native depends on `^3.0.0` |
| `babel-preset-expo` | 57.0.9 | lockfile |
| `@electric-sql/client` | 1.5.23 (1.5.28 is latest) | lockfile, through `@tanstack/electric-db-collection` 0.4.10 |

## The answer

- **Install React Native's `fetch` as the global by setting
  `EXPO_PUBLIC_USE_RN_FETCH=1` at bundle time.** Shapes and commands then use
  the same one, because both go through `sessionFetch`, the installed fetcher is
  the token client's `fetch`, and that calls the global `fetch` on every request.
  There is one switch and no reason to split it.
- **React Native's `fetch` cannot hang or truncate a body read the way
  `expo/fetch` does.** It is `whatwg-fetch` over `XMLHttpRequest`, and its
  promise resolves only after the native layer has the whole body. A connection
  lost mid-body rejects with a `TypeError` on both platforms, and `abort()`
  rejects with an `AbortError` up to the moment the promise resolves, after which
  there is nothing left to read.
- **SDK 58 is not the way out.** 58.0.2 carries the iOS fix (#48230), but the
  Android truncation is unchanged, it ships React Native 0.88.0-rc.3, and the
  Expo SQLite persistence package does not declare `expo-sqlite` 58.
- **Two things hold under either fetch and the build has to handle them.**
  Android's networking client has no timeouts and allows five requests per host
  at once, so the command queue needs its own timeout and many live long polls
  will queue commands behind them.

## The state of expo/expo#50213 on the SDK the build targets

[expo/expo#50213](https://github.com/expo/expo/issues/50213) is open (last
updated 2026-09-22). It reports two defects in `expo/fetch`'s buffered body
readers, `text()` and `arrayBuffer()`:

- **iOS: a body read never settles** when the connection fails after the headers
  arrived, and `abort()` does not settle it either.
- **Android: a body read resolves truncated** with status 200 and no error,
  because the error state is overwritten with "body completed".

I read the native sources in the published tarballs:

| | iOS hang | Android truncation |
| --- | --- | --- |
| `expo` 57.0.26 | **present.** Both readers wait on `[.bodyCompleted]` only ([`ios/Fetch/ExpoFetchModule.swift` L75, L82](https://unpkg.com/expo@57.0.26/ios/Fetch/ExpoFetchModule.swift)) | **present.** The `IOException` catch sets `ERROR_RECEIVED` ([`NativeResponse.kt` L217-222](https://unpkg.com/expo@57.0.26/android/src/main/java/expo/modules/fetch/NativeResponse.kt)), then L158 sets `BODY_COMPLETED` unconditionally; the readers wait on `BODY_COMPLETED` only ([`ExpoFetchModule.kt` L109, L116](https://unpkg.com/expo@57.0.26/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt)) |
| `expo` 58.0.2 | **fixed.** Both readers wait on `[.bodyCompleted, .errorReceived]` and reject on the error ([`ios/Expo/Fetch/ExpoFetchModule.swift` L74-95](https://unpkg.com/expo@58.0.2/ios/Expo/Fetch/ExpoFetchModule.swift)) | **present.** Same overwrite at L158, catch now at L222-226 ([`NativeResponse.kt`](https://unpkg.com/expo@58.0.2/android/src/main/java/expo/modules/fetch/NativeResponse.kt)); readers unchanged at L109, L116 |

The changelogs agree. The `sdk-58` branch lists "[iOS] Fix `expo/fetch`
`Response.text()` and `.arrayBuffer()` never settling when the request fails"
(#48230) under 58.0.0-preview.0
([CHANGELOG on `sdk-58`](https://github.com/expo/expo/blob/sdk-58/packages/expo/CHANGELOG.md)).
The `sdk-57` branch has no such entry, and 57.0.24, 57.0.25 and 57.0.26 each
read "This version does not introduce any user-facing changes"
([CHANGELOG on `sdk-57`](https://github.com/expo/expo/blob/sdk-57/packages/expo/CHANGELOG.md)).
The Android fix is [expo/expo#49324](https://github.com/expo/expo/pull/49324),
still open and unmerged, last updated 2026-09-03.

Three neighbouring reports are also open:
[#50126](https://github.com/expo/expo/issues/50126) (iOS, `expo/fetch` never
settles when the server truncates the response mid-upload, not claimed to be the
same defect), [#50212](https://github.com/expo/expo/issues/50212) (network
failures reject with a plain `Error`, not a `TypeError`) and
[#48251](https://github.com/expo/expo/pull/48251) (the PR for that error shape).

So on SDK 57, the SDK `apps/mobile` targets, both defects ship in every release,
and nothing on the `sdk-57` branch says a backport is coming.

### What moving to SDK 58 would cost

- **Android still truncates.** The table above.
- **React Native 0.88.0-rc.3.** That is the version `expo` 58.0.2 pins in its
  `package.json` and `bundledNativeModules.json`, a release candidate.
- **The persistence package does not declare SDK 58.**
  `@tanstack/expo-db-sqlite-persistence` 0.2.26, the latest, peers on
  `expo-sqlite` `^55.0.10 || ^57.0.0` (`npm view`, 2026-10-02). `expo-sqlite`
  58 is published under `next`. #1331 chose that package.

## How React Native's fetch reads a response

### The JS half

React Native's `fetch` is `whatwg-fetch`, installed as a side effect
([`Libraries/Network/fetch.js`](https://unpkg.com/react-native@0.86.3/Libraries/Network/fetch.js)).
In 3.6.20
([`fetch.js` L526-633](https://unpkg.com/whatwg-fetch@3.6.20/fetch.js)):

- The returned promise resolves only in `xhr.onload`, which fires when the
  native request has completed. The body is already in `xhr.response` at that
  point, and the `Response` is built from it (L540-557). Nothing streams.
- `xhr.onerror` rejects with `new TypeError('Network request failed')`,
  `xhr.ontimeout` with `new TypeError('Network request timed out')`, and
  `xhr.onabort` with `new DOMException('Aborted', 'AbortError')` (L559-575).
- A request with a `signal` calls `xhr.abort()` on abort (L620-629), and an
  already aborted signal rejects before sending (L530-532).
- It asks for `responseType = 'blob'` where `Blob` and `FileReader` exist
  (L593-601), which they do in React Native. `text()` then reads the blob with
  `FileReader.readAsText` (L312-326), which React Native implements natively
  ([`Libraries/Blob/FileReader.js` L132-141](https://unpkg.com/react-native@0.86.3/Libraries/Blob/FileReader.js)).
- It marks itself with `fetch.polyfill = true` (L635), which the app can assert
  on at startup to prove the bundle-time switch took effect.

React Native's `XMLHttpRequest`
([`Libraries/Network/XMLHttpRequest.js`](https://unpkg.com/react-native@0.86.3/Libraries/Network/XMLHttpRequest.js))
turns a native completion carrying an error into `_hasError` and then `DONE`
(L421-450), and `setReadyState(DONE)` dispatches `abort`, `timeout`, `error` or
`load`, in that order of precedence (L684-705). `abort()` cancels the native
request and moves to `DONE` (L654-671). There is no state in which a sent request
reaches `DONE` without one of those four events, so the `whatwg-fetch` promise
always settles once the native side reports completion or the caller aborts.

### Android

`NetworkingModule` hands each request to OkHttp
([`NetworkingModule.kt`](https://unpkg.com/react-native@0.86.3/ReactAndroid/src/main/java/com/facebook/react/modules/network/NetworkingModule.kt)):

- `onFailure` (L622-636), for a failure before a response, reports
  `onRequestError`.
- `onResponse` (L639-788) sends the headers to JS, then reads the body. For the
  `blob` type `whatwg-fetch` asks for, the registered blob handler takes it and
  the body is read whole with `responseBody.bytes()` (L695-711). Any
  `IOException` from that read, which is what OkHttp raises for a body shorter
  than its `Content-Length` or a chunked body cut off before its last chunk, is
  caught at L768-776 and reported as `onRequestError`. There is no path that
  reports success after a failed read.
- Cancelling is `OkHttpCallUtil.cancelTag` on the call (L888-890).

So a truncated body on Android rejects the `fetch` promise with a `TypeError`.
That is the opposite of `expo/fetch`'s behaviour on the same OkHttp.

### iOS

`RCTNetworking` builds an `NSURLRequest` and runs it through `NSURLSession`
([`RCTNetworking.mm`](https://unpkg.com/react-native@0.86.3/Libraries/Network/RCTNetworking.mm),
[`RCTHTTPRequestHandler.mm`](https://unpkg.com/react-native@0.86.3/Libraries/Network/RCTHTTPRequestHandler.mm)).
The task's completion block (L676-711) sends the data it has and then
`didCompleteNetworkResponse` with `error.localizedDescription` and a timeout flag.
`URLSession:task:didCompleteWithError:` forwards every completion, success or
failure (`RCTHTTPRequestHandler.mm` L186-195). With an error present, the XHR
fires `error`, and `whatwg-fetch` never reads the partial data, because it only
reads `xhr.response` in `onload`.

### Hermes

Nothing in this path needs an engine feature beyond what #1332 already covered.
`whatwg-fetch` is plain JS over `XMLHttpRequest`, `Blob` and `FileReader`, which
React Native provides, and the transfer and chunked decoding happen in OkHttp and
`NSURLSession`.

## What Electric asks of a fetch

Electric 1.5.23 takes `fetchClient?: typeof fetch` and nothing more specific
([TypeScript client docs](https://github.com/electric-sql/electric/blob/main/website/docs/sync/api/clients/typescript.md)).
On the long-poll path SIMMER uses (`packages/sync` never sets `liveSse`), it
reads a response in four ways, all of which `whatwg-fetch` supports:

- `res.text()`, once in `consumeResponseBody` and again on the rebuilt response
  ([`fetch.ts` L194-224](https://unpkg.com/@electric-sql/client@1.5.23/src/fetch.ts),
  [`client.ts` L1689-1721](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts));
- `new Response(text, res)` to rebuild it, which takes status, status text and
  headers off the first response;
- `res.headers.get` and `res.headers.entries()`;
- `response.body?.cancel()` before a stale retry
  ([`client.ts` L1482](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
  A `whatwg-fetch` `Response` has no `body`, so the optional chain does nothing,
  and the connection is already closed by then.

1.5.28 has the same reads at the same lines, so the client upgrade the TanStack
DB 0.11.0 baseline brings in does not change this.

Electric's error handling fits too. A rejected fetch is retried by the backoff
unless it is a 4xx `FetchError`, and an aborted signal is turned into
`FetchBackoffAbortError` (`fetch.ts` L101-170, L208-211). `TypeError` and
`AbortError` both fall into those paths.

### The watchdog covers the body under React Native's fetch

Electric's live watchdog (`liveRequestTimeoutMs`, 45 s) races the `fetch()`
promise and then reads the body after the race
([`client.ts` L1655-1700](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
Under `expo/fetch` the promise settles on headers, so a body read stuck after it
is out of the watchdog's reach, which is the iOS hang. Under React Native's
`fetch` the promise settles only after the whole body, so the watchdog and the
background pause can abort any live request at any point before the data is in
memory, and the later `text()` reads a blob that is already complete.

The watchdog applies only to live requests and refresh catch-up requests
(L1663-1667). An initial snapshot or a plain catch-up page has no client-side
time limit under either fetch.

## Which one the session fetcher installs

`packages/sync` holds one fetcher. `setSessionFetcher` stores it, and both the
shape streams (as Electric's `fetchClient`) and `writeCommand` call it through
`sessionFetch` (`packages/sync/src/collections/functions/session-fetch.ts`,
`write-command.ts` L137). The installer on a device is the token client's
`fetch`, `createAuthFetch` in `packages/auth/src/client/create-auth-fetch.ts`,
and it calls the bare global `fetch` at request time. Sign-in and `/auth/me` go
through the same client.

So whichever `fetch` is global is the one shapes, commands and the session all
use. Expo's runtime decides that once, before app code runs: it installs
`expo/fetch` over the global unless `process.env.EXPO_PUBLIC_USE_RN_FETCH` is `1`
or `true`
([`src/winter/runtime.native.ts` L41-53](https://unpkg.com/expo@57.0.26/src/winter/runtime.native.ts)).
The SDK 57 docs say the same and add that named imports from `expo/fetch` still
work with the flag set
([`expo.mdx`, "`expo/fetch` API"](https://github.com/expo/expo/blob/main/docs/pages/versions/v57.0.0/sdk/expo.mdx)).
The variable is inlined by `babel-preset-expo`, and the opt-out only works in a
production build from `babel-preset-expo` 57.0.0 on (#46986, in its
[changelog on `sdk-57`](https://github.com/expo/expo/blob/sdk-57/packages/babel-preset-expo/CHANGELOG.md));
the lockfile has 57.0.9. Because it is inlined, it has to be present when the
bundle is built, in the EAS build profile's environment or a `.env` that
`expo` loads, and not only at run time.

Splitting shapes and commands across two fetches would mean giving
`createAuthFetch` an implementation to call. Nothing in v1 needs `expo/fetch`'s
one advantage, a streaming body: the shapes long-poll, command bodies are small
JSON, tiles are drawn from synced rows (#1340), and photos are out of scope.

## Why the command queue cares as much as the shapes do

`writeCommand` reads every answer with `response.text()` and parses it, and a
2xx without a numeric `txid` is thrown as a `CommandError` carrying the 2xx
status (`write-command.ts`, `readBody` and the check after it). The queue
settled in #1335 replays one entry at a time in creation order, deletes an entry
on the 2xx, retries "no response, 5xx, 408, 429" and treats 400, 403, 404, 409
and 422 as refusals. Against `expo/fetch` on SDK 57:

- **iOS:** a command whose connection drops after the headers leaves `text()`
  pending for the life of the process. The queue is serial, so every later
  command waits behind it. #48124's original report was this shape, an upload
  queue parked until the app was killed.
- **Android:** a truncated 2xx parses as `{ message }` with no `txid`. The
  command committed on the server, and the queue sees a `CommandError` with a
  2xx status, which none of #1335's buckets names. If it is treated as a
  refusal, a write that happened is shown as refused.

Under React Native's `fetch` both cases reject with a `TypeError`, which is "no
response" in #1335's terms: retried, and answered from the idempotency receipt.

## What holds under either fetch

### Android has no network timeouts

`OkHttpClientProvider.createClientBuilder` sets connect, read and write timeouts
to zero, commented "No timeouts by default"
([`OkHttpClientProvider.kt` L48-56](https://unpkg.com/react-native@0.86.3/ReactAndroid/src/main/java/com/facebook/react/modules/network/OkHttpClientProvider.kt)).
`whatwg-fetch` never sets `xhr.timeout`, so React Native's per-call timeout is
zero as well. `expo/fetch` builds its client from the same provider
([`ExpoFetchModule.kt` L27](https://unpkg.com/expo@57.0.26/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt)).
A request on a connection that goes silent without a reset can wait forever. On
iOS the XHR timeout is copied onto the request as `timeoutInterval`
(`RCTNetworking.mm` L335); what `NSURLSession` does with zero there is not stated
in the sources I read.

The difference between the two fetches is what an abort can do about it. Under
React Native's `fetch` an abort always settles the promise, so a deadline works:
the queue can send each command with `AbortSignal.timeout(...)`, which Expo
installs (#1332), and Electric's watchdog and background pause already abort
live requests. A snapshot or catch-up page still has no deadline, and adding one
would be a wrapper around the installed fetcher or an option `packages/sync`
passes through, sized to a large first snapshot on a slow connection.

### Android allows five requests per host at once

React Native's client and `expo/fetch`'s both come from
`OkHttpClientProvider.createClient`, and neither sets a `Dispatcher`. OkHttp
4.9.2, the version React Native 0.86.3 pins
([`gradle/libs.versions.toml` L37](https://unpkg.com/react-native@0.86.3/gradle/libs.versions.toml)),
defaults `maxRequestsPerHost` to 5 and queues further async calls to that host
([`Dispatcher.kt` L46-72, L171-172](https://github.com/square/okhttp/blob/parent-4.9.2/okhttp/src/main/kotlin/okhttp3/Dispatcher.kt)).
That limit counts calls, not connections, so HTTP/2 does not lift it. On iOS
the equivalent `httpMaximumConnectionsPerHost` is 6 and HTTP/2 ignores it
([Apple docs](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/httpmaximumconnectionsperhost)).

Every synced collection holds a live long poll once it is up to date, the
Electric server holds a live request for up to 20 s
([`config.ex` L64, `long_poll_timeout: 20_000`](https://github.com/electric-sql/electric/blob/main/packages/sync-service/lib/electric/config.ex)),
and the mobile matrix in `docs/sync.md` syncs more than twenty areas. With six or
more live shapes on Android, a command waits in OkHttp's queue until a long poll
returns, and queued shape requests spend their wait inside Electric's 45 s
watchdog. Electric's troubleshooting guide describes the browser version of this
for HTTP/1.1 and says HTTP/2 fixes it
([troubleshooting.md](https://github.com/electric-sql/electric/blob/main/website/docs/sync/guides/troubleshooting.md)),
which is true for a browser and not for OkHttp. I have not measured it on a
device. React Native exposes `OkHttpClientProvider.setOkHttpClientFactory` for
replacing the client, which is native code an Expo config plugin would add.

### Cookies

React Native's networking also stores and sends cookies: iOS sets
`HTTPShouldSetCookies` and an always-accept policy on its session
(`RCTHTTPRequestHandler.mm` L89-99) and honours `withCredentials` per request
(`RCTNetworking.mm` L319), and Android uses a cookie jar on every request
(`OkHttpClientProvider.kt` L55). So #1332's open question about the session held
twice, in SecureStore and in the native cookie store, is the same under either
fetch.

## What the build has to do

1. Set `EXPO_PUBLIC_USE_RN_FETCH=1` in every EAS build profile and in the local
   `.env` for `apps/mobile`, and assert at startup that
   `(globalThis.fetch as { polyfill?: boolean }).polyfill === true`, failing
   loudly if a build lost the variable.
2. Install `authClient.fetch` with `setSessionFetcher`, as #1332 says. Nothing
   in `packages/auth` or `packages/sync` changes for the choice of fetch.
3. Give every command request in the queue a deadline with
   `AbortSignal.timeout`, and classify an `AbortError` from it as "no response".
4. Decide in the queue what a 2xx without a `txid` means. Under React Native's
   `fetch` it means the server answered without one, not a truncation, but
   #1335's buckets do not name it.
5. Measure the five-per-host queueing on an Android device with the real number
   of live shapes before deciding whether to raise `maxRequestsPerHost` through
   a client factory.

## Checks only a device can make

- That an iOS long poll whose connection drops between headers and body rejects
  under `EXPO_PUBLIC_USE_RN_FETCH=1`, and hangs without it.
- That a truncated body on Android rejects under React Native's `fetch` (the
  server in #50213's reproduction is enough).
- How long a command waits behind live long polls on Android, and whether
  Electric's watchdog fires on queued shape requests.
- What `NSURLSession` does with a request `timeoutInterval` of zero.
- Memory on the largest first snapshot, since React Native's `fetch` holds each
  response as a native blob and then a JS string.
