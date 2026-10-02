# Electric shape streams and the session fetcher on React Native

Status: Current. About work that is not built: `apps/mobile` does not depend on
`@simmer-mosquito/sync` yet.

Research for
[Research: Electric shape streams and the session fetcher on React Native](https://github.com/thebigthing313/simmer-mosquito/issues/1332),
part of [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
Checked on 2026-10-01 against the versions the lockfile resolves. Every claim
about a library was read from its published tarball, its repository at the
release branch, or its own docs, and the link is given. Where something needs a
device to settle, I say so. This file reports facts and options; it does not
make the product decision.

## Versions in play

| Package | Version | Where it is pinned |
| --- | --- | --- |
| `@electric-sql/client` | 1.5.23 (published 2026-07-02) | transitive, through `@tanstack/electric-db-collection` (`^1.5.15`), resolved in `pnpm-lock.yaml` |
| `@tanstack/electric-db-collection` | 0.4.10 | exact, `packages/sync/package.json` |
| `@tanstack/db` | 0.9.2 | `packages/sync/package.json`, `apps/web/package.json` |
| `expo` | 57.0.17 | `apps/mobile/package.json` (`~57.0.12`), lockfile |
| `react-native` | 0.86.3 | `apps/mobile/package.json` |

## Summary

- **The stream code runs on Hermes as is.** Electric 1.5.23 uses long polling
  by default, reads each response with `response.text()`, and needs `fetch`,
  `URL`/`URLSearchParams`, `AbortController` and `setTimeout`. Expo SDK 57
  installs spec `URL`, `URLSearchParams`, `TextDecoder`, `structuredClone` and
  `AbortSignal.timeout`/`any` as globals, so no polyfill is needed for the
  stream. `@tanstack/db` needs `crypto.randomUUID` or `crypto.getRandomValues`
  for transaction ids, which Hermes does not provide (see "Polyfills").
- **The global `fetch` on SDK 57 is `expo/fetch`, not React Native's.** Since
  SDK 56 Expo replaces the global unless `EXPO_PUBLIC_USE_RN_FETCH` is set.
  `expo/fetch` on SDK 57 has two open body-read defects that land on exactly
  the call Electric makes: on iOS `text()` can hang forever after the
  connection drops mid-body, and on Android it can resolve truncated with a 200.
- **The session fetcher already works for a token client.** `authClient.fetch`
  from `createAuthClient` attaches `Authorization: Bearer` and
  `x-simmer-client: token` and writes every `x-simmer-session` rotation to
  SecureStore. Shape routes never rotate (they are verify only since the #298
  work), so the rotation arrives on `/auth/me` through the installed recovery,
  and the retried shape request reads the fresh bearer. Nothing in
  `packages/auth` has to change for that.
- **Background and foreground need one line from the app.** Electric 1.5.23
  tries to find React Native's `AppState` through a global `require`, which a
  Metro build does not define, so in practice the stream does not pause in the
  background. Electric's own fix (1.5.24, PR 4683) moves this to a
  `react-native` export condition. `packages/sync` already accepts a
  `runtimeVisibility` adapter, so `apps/mobile` can pass an `AppState` one on
  every collection today.
- **An hour offline is a resume, not a re-snapshot,** while the process lives:
  Electric retries forever with backoff capped at 32 s and keeps the offset in
  memory. The exception is a shape the server deleted in the meantime (a
  migration on that table, a new replication slot, eviction), which answers 409
  and forces a full re-sync.
- **Across an app restart nothing is kept today.** `electric-db-collection`
  0.4.10 can resume from a saved offset and handle, but only when a persistence
  wrapper supplies collection metadata, and the Expo wrapper that supports
  SDK 57 requires `@tanstack/db` 0.11.0. The generated collection factories in
  `packages/sync` also call `createCollection` themselves, which leaves no place
  to wrap them.

## Does the Electric client run under Hermes

### What the stream calls

Electric's `ShapeStream` builds each request URL with `new URL(...)` and
`searchParams.set/append/sort`
([client.ts L630-640, L1264-1382](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)),
sends it through the `fetchClient` it is given (SIMMER's `sessionFetch`), and
reads the body with `await res.text()` in `consumeResponseBody`
([fetch.ts L194-224](https://unpkg.com/@electric-sql/client@1.5.23/src/fetch.ts))
and again in the long-poll path ([client.ts L1694-1721](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
It does not read `response.body` as a stream on that path.

Server-sent events are the one mode that needs a streaming body: `liveSse`
hands the request to `@microsoft/fetch-event-source`
([client.ts L1761](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
`packages/sync` never sets `liveSse` (`syncCollectionConfig` in
`packages/sync/src/collections/functions/sync-collection.ts`), so SIMMER is on
long polling. Keep it that way on mobile unless the fetch below changes.

Two Electric caches use `localStorage`, the expired-shapes cache and the
up-to-date tracker. Both check `typeof localStorage === 'undefined'` and fall
back to memory only
([expired-shapes-cache.ts L40-56](https://unpkg.com/@electric-sql/client@1.5.23/src/expired-shapes-cache.ts),
[up-to-date-tracker.ts L121-137](https://unpkg.com/@electric-sql/client@1.5.23/src/up-to-date-tracker.ts)).
On a device they keep nothing across a restart, which costs nothing that
matters.

### Polyfills

Expo SDK 57's native runtime installs these globals before app code runs
([`packages/expo/src/winter/runtime.native.ts` on `sdk-57`](https://github.com/expo/expo/blob/sdk-57/packages/expo/src/winter/runtime.native.ts)):
`TextDecoder`, `TextDecoderStream`, `URL`, `URLSearchParams`, `DOMException`,
`structuredClone`, an `AbortSignal` patch adding `timeout` and `any`, and
`Symbol.asyncIterator`. The SDK docs say the built-in `URL` and
`URLSearchParams` replace React Native's shims and aim at full spec compliance,
with non-ASCII hostnames the only gap
([expo.mdx, "URL API"](https://github.com/expo/expo/blob/main/docs/pages/versions/v57.0.0/sdk/expo.mdx)).
That covers everything the stream calls.

One gap is outside Electric. `@tanstack/db` generates transaction ids with
`safeRandomUUID`, which uses `crypto.randomUUID` or `crypto.getRandomValues` and
throws when neither exists
([db utils/uuid.ts](https://unpkg.com/@tanstack/db@0.9.2/src/utils/uuid.ts)).
Hermes has no `crypto` global and the Expo runtime above installs none. Any
optimistic mutation will therefore throw until the app installs
`getRandomValues`, for example from `expo-crypto` or
`react-native-get-random-values`. This is a write-path fact, but it will be the
first error the first mutation on a device raises.

### The global `fetch` is `expo/fetch`

The same runtime file replaces the global `fetch` with `expo/fetch` unless
`EXPO_PUBLIC_USE_RN_FETCH` is `1` or `true`. The change is in the `expo`
changelog as "Use `expo/fetch` as default fetch" (#44987) under 56.0.0-preview.0
([CHANGELOG on `sdk-57`](https://github.com/expo/expo/blob/sdk-57/packages/expo/CHANGELOG.md)).
The opt-out did not work in production builds until babel-preset-expo 57.0.0
(#46986, same changelog file under `packages/babel-preset-expo`).

`expo/fetch` on SDK 57 has two body-read defects, documented with source line
references in
[expo/expo#50213](https://github.com/expo/expo/issues/50213) (open):

- **iOS.** `text()` and `arrayBuffer()` never settle when the connection fails
  after the headers arrived, and `abort()` does not settle them either. The fix
  ([#48230](https://github.com/expo/expo/pull/48230), for
  [#48124](https://github.com/expo/expo/issues/48124)) is on `main` and in
  SDK 58 previews, and was not backported to `sdk-57`.
- **Android.** A mid-body `IOException` is overwritten as "body completed", so
  `text()` resolves with a truncated string and status 200. Only an unmerged PR
  addresses it.

This matters here because of where Electric's watchdog sits. The live-request
watchdog (`liveRequestTimeoutMs`, default 45 s) races the `fetch()` promise,
which settles when the headers arrive, and the body read happens after the race
([client.ts L1663-1716](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
So on iOS a long poll that loses its connection between headers and body leaves
`text()` pending, and neither the watchdog nor the background pause can reach
it. I have not reproduced this against Electric on a device; the mechanism is
read from both sources. On Android a truncated body reaches Electric's JSON
parser and fails as a parse error rather than as silent bad data, because a
shape response is a JSON array.

A third open report, [expo/expo#50212](https://github.com/expo/expo/issues/50212),
says `expo/fetch` rejects network failures with a plain `Error` rather than a
`TypeError`. Electric's backoff retries anything that is not a 4xx `FetchError`
([fetch.ts L101-170](https://unpkg.com/@electric-sql/client@1.5.23/src/fetch.ts)),
so this does not affect the stream.

The options visible from the sources are: set `EXPO_PUBLIC_USE_RN_FETCH=1` and
take React Native's XHR-backed `fetch`, wrap the installed fetcher so a body
read is bounded and an unsettled one is abandoned, or move to SDK 58 when it
ships with the iOS fix. Which one is a decision for the build ticket.

## The session fetcher on a device

### What is already in place

`packages/sync` sends every shape request and every command write through
`sessionFetch`, which calls the fetcher the app installed with
`setSessionFetcher` and, on a 401, calls the installed `SessionRecovery` once
and retries once (`packages/sync/src/collections/functions/session-fetch.ts`).
Its docblock already names "the `fetch` member of a token client" as what a
device installs.

That member is `createAuthFetch` (`packages/auth/src/client/create-auth-fetch.ts`).
For a client built with a `SessionTransport`, it:

- reads the sealed session from the transport and sends
  `x-simmer-client: token` and `Authorization: Bearer <sealed>`
  (`credential-headers.ts`), merged last so no caller can forge them;
- passes an absolute URL or a `Request` through untouched (`address-on.ts`),
  which is what lets Electric's absolute shape URL through;
- reads `x-simmer-session` off every response and writes it to the transport
  when present.

`apps/mobile/src/auth/client.ts` already builds that client over a
SecureStore-backed transport whose reads are cached in memory after the first
hit (`apps/mobile/src/auth/session-store.ts`), so a screen of shape requests
costs one keystore read, not one per request.

The types fit too. `packages/auth`'s fetch types are derived from `typeof fetch`
rather than from `lib.dom`, because React Native's `fetch` types come from a
third place (`fetch-types.ts`), and `SessionFetcher` in `packages/sync` is
`typeof fetch`.

### Where rotation actually happens

The issue asks how the fetcher captures the rotated session "on every shape
request". On the server, shape and command routes sit behind
`createAuthContextMiddleware`, which calls `resolveAuthContext` with
`mayRefresh: false` (`apps/server/src/auth/middleware/create-auth-context-middleware.ts`).
Only `/auth/me` refreshes (`register-me.ts`, `mayRefresh: true`). So a shape
response never carries `x-simmer-session`. An expired access token comes back
as a 401 with `session_refresh_required`, and the sequence is:

1. `sessionFetch` sees the 401 and calls the recovery.
2. A recovery built with `createSessionRecovery` over `appAuthController` calls
   `controller.renew()`, which is single flight: one `/auth/me` however many
   collections were refused in the same tick
   (`create-app-auth-controller.ts`).
3. `/auth/me` goes out through the same `authFetch`, the server refreshes and
   answers with `x-simmer-session`, and `authFetch` writes it to SecureStore.
4. `sessionFetch` retries the shape request; `authFetch` reads the new bearer.

The cross-tab Web Lock that serializes renewals in a browser is absent on React
Native, and `platformLocks()` already returns `null` there
(`platform-locks.ts`), which falls through to running the renewal directly.

Electric wraps the fetcher in its own backoff, which hands any non-retryable
4xx straight back
([fetch.ts L127-136](https://unpkg.com/@electric-sql/client@1.5.23/src/fetch.ts)).
Because `sessionFetch` sits inside that wrapper, the renew-and-retry happens
before Electric ever sees the 401. Only a second refusal reaches Electric, and
it errors the collection.

### The cookie the device also receives

`writeSealedSession` always sets the cookie and adds the header only for a token
client (`apps/server/src/auth/session-transport/write-sealed-session.ts`), and
`readSealedSession` reads the cookie **first**, then the bearer
(`read-sealed-session.ts`). React Native's own docs say `credentials: 'omit'`
does not work with `fetch` and that cookie authentication is unstable
([network.md, "Known Issues"](https://github.com/facebook/react-native-website/blob/main/docs/network.md)),
and `authFetch` sends `credentials: 'include'` anyway. So a device may hold the
session twice, once in SecureStore and once in the native cookie store, and the
server prefers the cookie. Both are written from the same response, so they
agree in the normal case. Whether they can diverge, after a sign-out that
clears SecureStore, or an Organization switch, is a question for the session
ticket on the map and needs a device to answer. Not sending `Set-Cookie` to a
declared token client would remove the question, and that change is in
`apps/server`, not in either package.

## Background, foreground and network loss

### Pausing in the background

Electric pauses a stream while its host is hidden: the pause aborts the
in-flight request, issues no new ones, and on return sends a non-live catch-up
request from the offset it already has
([client.ts L2013-2055](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts);
[TypeScript client docs, "React Native and Expo lifecycle handling"](https://github.com/electric-sql/electric/blob/main/website/docs/sync/api/clients/typescript.md)).
It does not drop the offset or re-snapshot.

On a device the question is whether the stream learns that the app was
backgrounded. In 1.5.23, with no `runtimeVisibility` passed, `ShapeStream` calls
`detectReactNativeRuntimeVisibilityAdapter`, which looks for `require` on
`globalThis` or through `Function('return require')`
([client.ts L291-330](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
Metro defines `global.__r`, not `global.require`
([metro-runtime require.js](https://github.com/facebook/metro/blob/main/packages/metro-runtime/src/polyfills/require.js)),
and Electric's own fix says the same thing as its root cause: "In Metro/Hermes
builds, `require` is available at module scope but not necessarily on
`globalThis`, and the function fallback can return `undefined`. When that
happened, `runtimeVisibility` stayed unset and the AppState listener was never
installed"
([electric-sql/electric#4683](https://github.com/electric-sql/electric/pull/4683),
merged 2026-07-07, first published in 1.5.24 on 2026-07-08). Two user reports
describe the result,
[#4497](https://github.com/electric-sql/electric/issues/4497) (closed) and
[#4116](https://github.com/electric-sql/electric/issues/4116) (still open, on an
older collection version): sync stops after a resume until the app is killed.

What still protects 1.5.23 on a device:

- **Wake detection.** With no `document` API, the stream runs a 2 s interval and
  treats a gap over 6 s as a wake from sleep, aborting and re-issuing the
  in-flight request
  ([client.ts L2059-2125](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
  A JS thread suspended in the background shows up as that gap.
- **The live watchdog.** A live request that has not answered in 45 s is
  aborted and re-issued (`liveRequestTimeoutMs`, default set at
  [client.ts L822](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).

Neither reaches the iOS body-read hang above, and neither stops a backgrounded
app from holding open a long poll per collection, which is what the pause is
for.

The direct fix needs no change to `packages/sync`. `SyncCollectionClientOptions`
already has `runtimeVisibility`, typed as a restatement of Electric's adapter,
and `syncCollectionConfig` passes it into `shapeOptions`. Electric's docs give
the adapter for React Native: `createReactNativeRuntimeVisibilityAdapter(AppState)`,
which maps `active` to visible and anything else to hidden
([client.ts L270-290](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
`apps/mobile` can build the same ten lines over `AppState` and pass it to every
collection. The docblocks on `runtimeVisibility` and `alwaysVisibleRuntime`
describe it as a development-only switch for web; on mobile it would be the
production setting, and the comments would need to say so.

Upgrading the client to 1.5.24 or later is the other route, and it is not
certain to work on its own. In 1.5.28's `exports`, the root entry lists
`import` before `react-native`, and Metro matches conditions in the order the
package declares them
([Metro "Package Exports Support"](https://github.com/facebook/metro/blob/main/docs/PackageExports.md)).
An ESM import from `@tanstack/electric-db-collection` may therefore resolve the
non-native entry. I have not checked this on a device. Passing
`runtimeVisibility` explicitly is the route Electric's docs keep as the
fallback, and it does not depend on resolution.

### An hour without network

Electric's backoff retries a failed request forever by default
(`maxRetries: Infinity`), with full jitter, starting at 1 s and capped at 32 s,
and honours `Retry-After`
([fetch.ts L48-53, L101-170](https://unpkg.com/@electric-sql/client@1.5.23/src/fetch.ts)).
The offset and handle stay in memory. When the network returns, the next retry
asks for changes since that offset. The collection keeps its last ready rows
while it waits: `electric-db-collection` marks the collection errored only when
the initial sync fails, and otherwise logs that "the last ready snapshot has
been preserved"
([electric.ts, `onError`](https://unpkg.com/@tanstack/electric-db-collection@0.4.10/src/electric.ts)).

The exception is a deleted shape. Electric answers 409, the client publishes a
`must-refetch`, and the collection discards its rows and re-syncs from scratch
([client.ts L1118-1144](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts)).
Electric's docs list when a shape handle is deleted
([shapes guide, "Why shape handles get deleted"](https://github.com/electric-sql/electric/blob/main/website/docs/sync/guides/shapes.md)):

- a new replication slot, or a Postgres timeline change, purges every shape;
- a schema change on a table invalidates every shape on that table, so any
  migration that alters a synced table re-snapshots that table on every
  device;
- eviction under `ELECTRIC_MAX_SHAPES`;
- an explicit `DELETE /v1/shape`.

An hour offline does not cause any of these by itself. A deploy that ships a
migration during that hour does.

If the OS kills the process while it is in the background, the in-memory offset
goes with it, and the next launch is an app restart.

## Does a persisted collection keep its offset across a restart

### What the collection can do

`electric-db-collection` 0.4.10 resumes from a saved position. At sync start it
reads `electric:resume` from the collection's sync metadata and, when the saved
state matches this shape's identity (its URL and params) and the persisted rows
can be verified as hydrated, starts the `ShapeStream` at the saved `offset` and
`handle` instead of from scratch
([electric.ts, `readPersistedResumeState` through the `ShapeStream`
construction](https://unpkg.com/@tanstack/electric-db-collection@0.4.10/src/electric.ts)).
When the saved state is missing, marked `reset`, or cannot be trusted, an eager
or progressive collection takes a full snapshot that replaces the cached rows,
and an on-demand one starts from `now`.

The metadata store comes from a persistence wrapper, not from the collection.
Without one, which is SIMMER today, nothing survives a restart: every eager
table re-snapshots on launch.

### The persistence package and the version it needs

TanStack's SQLite persistence guide says the wrapper "can also save sync
metadata so a supported sync adapter can resume safely", and lists
`@tanstack/expo-db-sqlite-persistence` for Expo over `expo-sqlite`
([sqlite-persistence.md](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md)).
It wraps a sync adapter's options:
`createCollection(persistedCollectionOptions({ ...adapterOptions, persistence, schemaVersion }))`.
With `sync` present, it loads persisted rows and then applies the source's sync
transactions. It also supports `syncMode: 'on-demand'`, while its
`initialRender` option needs an eager collection.

The versions do not line up with this workspace:

| `@tanstack/expo-db-sqlite-persistence` | core it pins | `@tanstack/db` it pins | `expo-sqlite` peer |
| --- | --- | --- | --- |
| 0.2.23 | 0.2.23 | 0.9.2 | `^55.0.10` |
| 0.2.25 (latest, 2026-09-30) | 0.4.0 | 0.11.0 | `^55.0.10 \|\| ^57.0.0` |

Read with `npm view` against the registry on 2026-10-01. The build that matches
`@tanstack/db` 0.9.2 does not declare SDK 57 support, and the one that does
needs `@tanstack/db` 0.11.0, whose matching collection is
`@tanstack/electric-db-collection` 0.5.1. The workspace pins those packages
together, so persistence on SDK 57 means a workspace-wide TanStack DB upgrade,
web included, or installing 0.2.23 against an undeclared peer. For the command
queue, `@tanstack/offline-transactions` 1.0.56 pins `@tanstack/db` 0.9.2 and
1.0.58 pins 0.11.0, so the same choice applies there.

### What is still open

- **Organization switch.** The shape identity Electric saves is the URL and
  params, and the shape URL carries no Organization: the server forces the
  `where` from the session (`syncCollectionConfig`'s comment on `url`). A
  persisted table and its saved handle therefore look the same under two
  Organizations. What Electric answers to a handle presented under a different
  `where`, and what the device shows from SQLite before that answer, is not
  documented in the sources I read. The session ticket on the map should settle
  it, probably by keying the database per Organization.
- **Server URL.** Changing `EXPO_PUBLIC_SERVER_URL` changes the shape identity,
  so a device moved between servers re-snapshots rather than resuming. That is
  the right outcome.

## What has to change

### `packages/sync`

1. **A seam for persistence.** Each generated factory in
   `packages/sync/src/collections/*.ts` calls
   `createCollection(electricCollectionOptions(...))` itself, so `apps/mobile`
   cannot wrap the options in `persistedCollectionOptions`. The generator
   (`scripts/generate-table-schemas.mjs`) has to emit either an options
   function per table beside the factory, or a factory that takes a wrapper.
   `pnpm check:schemas` holds the factories to the generator, so the change is
   in the generator.
2. **A TanStack DB upgrade** to 0.11.0 and `electric-db-collection` 0.5.x, if
   persistence on SDK 57 uses a release that declares SDK 57 support. That is
   a workspace change and touches `apps/web`.
3. **Docs on `runtimeVisibility`.** The option exists and needs no code change,
   but its docblock and `alwaysVisibleRuntime`'s describe a development-only
   switch. On mobile an `AppState` adapter is the production setting. The
   package could also export a factory that takes an `AppState`-shaped object,
   restated the way `RuntimeVisibility` is, so the app does not write its own;
   it must not import `react-native`, because shared packages avoid platform
   code.
4. Optional: pass-throughs for `liveRequestTimeoutMs` and `backoffOptions` in
   `SyncCollectionClientOptions`, only if a device measurement says Electric's
   defaults are wrong for the field. Nothing found so far says they are.

### `packages/auth`

Nothing is required for shape streams to authenticate or to pick up a rotated
session. Two things are worth deciding:

1. **The `expo/fetch` body-read defects.** If the answer is a bounded body read
   rather than `EXPO_PUBLIC_USE_RN_FETCH` or an SDK upgrade, the token
   client's `fetch` in `create-auth-fetch.ts` is where it would live, since
   every shape and command request goes through it.
2. **`credentials: 'include'` on the token path.** It is inert for the bearer
   and is how the native cookie store ends up holding a second copy of the
   session. Whether to drop it for a token client depends on the cookie
   question above, and the cleaner fix is in `apps/server`.

### `apps/mobile` (for completeness)

- Depend on `@simmer-mosquito/sync` and add the tsconfig reference
  (`check:build-graph`).
- At module scope, `setSessionFetcher(authClient.fetch)` and
  `setSessionRecovery(createSessionRecovery({ controller: appAuthController, onSessionLost }))`.
  `pnpm check:session-fetcher` will require the first once the app imports
  the barrel.
- Install `crypto.getRandomValues` before any collection mutates.
- Pass an `AppState` `runtimeVisibility` to every collection.
- Choose a fetch: `expo/fetch` with a bounded body read, or
  `EXPO_PUBLIC_USE_RN_FETCH=1`, or SDK 58.

## Checks only a device can make

- That an unpatched 1.5.23 stream keeps a long poll open in the background, and
  that passing the `AppState` adapter stops it.
- That an iOS long poll interrupted between headers and body hangs under
  `expo/fetch` on SDK 57, and does not under `EXPO_PUBLIC_USE_RN_FETCH=1`.
- Whether `Set-Cookie` from the server lands in the native cookie store under
  `expo/fetch` and is sent back, and what the server reads after a sign-out.
- Whether Electric 1.5.24+ resolves its `react-native` entry under this Metro
  config.
