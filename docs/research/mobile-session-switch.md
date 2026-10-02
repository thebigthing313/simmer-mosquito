# The cookie jar and saved shape handles across sign-out and an Organization switch

Status: Research for
[#1343](https://github.com/thebigthing313/simmer-mosquito/issues/1343), part of
[Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
Nothing is built and no source file changed. Checked on 2026-10-02 against
`develop` at `13fdfd08` and the versions the lockfile resolves: `expo` 57.0.26,
`react-native` 0.86.3, `@electric-sql/client` 1.5.23,
`@tanstack/electric-db-collection` 0.4.10, `@workos-inc/node` 8.13.0. The
Electric server is `electricsql/electric:latest` in `docker-compose.yml`, which
was sync-service 1.8.1 on this date. Library claims were read from the published
tarball or the repository at the release tag, and each is linked. Where only a
device can settle something, I say so.

It follows
[docs/research/mobile-electric-shapes.md](https://github.com/thebigthing313/simmer-mosquito/blob/research/mobile-electric-shapes/docs/research/mobile-electric-shapes.md),
which left both questions here open.

## The answer in one screen

- **The device has a real, persistent cookie jar, and the server reads it
  first.** Both `fetch` implementations an SDK 57 app can run, `expo/fetch` (the
  default global) and React Native's own, send and store cookies through the
  platform's shared store when `credentials` is `include`: `HTTPCookieStorage.shared`
  on iOS, the WebView `CookieManager` on Android. `authFetch` always sends
  `include`. So after sign-in the device holds the session twice, and
  `readSealedSession` reads the cookie before the bearer. ADR 0016's premise
  that React Native "has no cookie jar worth depending on" is not true of this
  stack.
- **In the normal case the two agree.** Every response that changes the session
  writes the cookie and the `x-simmer-session` header from one value: sign-in,
  rotation on `/auth/me`, and `/auth/switch-organization`. Neither can name a
  different Organization from the other after a successful switch.
- **Sign-out is where they split, and the split signs the user back in.**
  `signOut` clears SecureStore whether or not `POST /auth/logout` succeeded. If
  the logout request did not complete (offline, server down, a dropped
  connection), the jar still holds a live sealed session. The next `/auth/me`
  carries `x-simmer-client: token` with no bearer, the server reads the cookie,
  authenticates it, and when it rotates, echoes it in `x-simmer-session`, which
  `authFetch` writes back into SecureStore. The signed-out user, or whoever picks
  up the device next, is signed in as them again. Offline, the screen does not
  even leave the signed-in state, because a failed `/auth/me` keeps the old
  snapshot.
- **A jar that lags SecureStore can end a good session.** If a rotated cookie is
  lost (Android's `CookieManager` persists asynchronously, and React Native's own
  comment says cookies "may be lost if the application is terminated before it
  syncs"), the jar keeps the previous sealed session, whose refresh token was
  already spent. The server prefers it over the fresh bearer, and the next
  refresh spends a used token.
- **Electric never serves the old shape.** A saved handle is checked against the
  hash of the shape the request describes, and that hash includes the `where`
  with its `$1` already bound. A handle from Organization A presented with
  Organization B's forced `where` fails the check, and Electric answers `409`
  with `control: must-refetch` and B's handle (creating B's shape first if it
  does not exist). The client marks the old handle expired, publishes
  `must-refetch`, and the collection truncates and re-snapshots.
- **What the device shows meanwhile is A's rows.** The truncate is staged in a
  sync transaction that commits with B's first `up-to-date`, so A's rows stay on
  screen until B's snapshot lands, and indefinitely while offline. With
  persistence, the saved resume state matches B too, because the collection's
  shape identity is the URL and params and neither carries an Organization; the
  device loads A's rows from SQLite under B's session before any request goes
  out.
- **The fix for the jar is one server change.** Stop setting the cookie for a
  declared token client and stop reading it from one, so a device's only
  credential is the bearer. Sending `credentials: 'omit'` from the token client is
  a second layer that both fetches honour at source level. The fix for the rows
  is to key the persisted database (and the command queue) by Account and
  Organization, which is a decision for the spec, not for this note.

## Question 1: the cookie jar

### What the server does with the two transports

`readSealedSession` returns the cookie when there is one and only otherwise
looks at `Authorization: Bearer`
([apps/server/src/auth/session-transport/read-sealed-session.ts L12-25](../../apps/server/src/auth/session-transport/read-sealed-session.ts)).
`writeSealedSession` always calls `setCookie` (httpOnly, `Max-Age` 30 days,
`Path=/`, `SameSite=Lax`) and, for a request carrying `x-simmer-client: token`,
also sets `x-simmer-session` to the same value
([write-sealed-session.ts L16-36](../../apps/server/src/auth/session-transport/write-sealed-session.ts)).
`Max-Age` makes it a persistent cookie, so a platform store that keeps cookies on
disk keeps this one across launches.

Every route that reads a session goes through `readSealedSession`: the auth
middleware on shape and command routes (`mayRefresh: false`,
[create-auth-context-middleware.ts L25-33](../../apps/server/src/auth/middleware/create-auth-context-middleware.ts)),
`/auth/me` (`mayRefresh: true`,
[register-me.ts L19-41](../../apps/server/src/auth/session-routes/register-me.ts)),
`/auth/logout`
([register-logout.ts L18-25](../../apps/server/src/auth/session-routes/register-logout.ts))
and `/auth/switch-organization`
([register-switch-organization.ts L20-43](../../apps/server/src/auth/user-routes/register-switch-organization.ts)).
So on every one of them, a cookie in the jar wins over the bearer.

Two server facts matter for what a stale cookie can still do:

- `authenticate()` in the WorkOS SDK unseals the cookie and verifies the access
  token's JWT signature against the JWKS. It makes no call that would notice a
  revoked session
  ([workos-node v8.13.0 src/user-management/session.ts L45-100, L219-235](https://github.com/workos/workos-node/blob/v8.13.0/src/user-management/session.ts)).
  `packages/auth` refreshes only when that check fails and the route allows it
  ([packages/auth/src/server/methods/authenticate-session.ts L14-34](../../packages/auth/src/server/methods/authenticate-session.ts)).
  A sealed session therefore keeps authenticating shape and command requests
  until its access token expires, revoked or not.
- The refresh token inside it is single use (the same file's docblock, and
  #298, #301). Spending one twice is what WorkOS reads as reuse.

### What the device does with `Set-Cookie`

`authFetch` sends every request with `credentials: 'include'`
([packages/auth/src/client/create-auth-fetch.ts L60-80](../../packages/auth/src/client/create-auth-fetch.ts)),
and `credentialHeaders` sends `x-simmer-client: token` even when SecureStore
holds nothing, adding the bearer only when it does
([credential-headers.ts L89-100](../../packages/auth/src/client/credential-headers.ts)).

The previous note established that the global `fetch` on SDK 57 is `expo/fetch`
unless `EXPO_PUBLIC_USE_RN_FETCH` is set. Both paths use a cookie store:

| Path | iOS | Android |
| --- | --- | --- |
| `expo/fetch` (default) | The module's `URLSession` is configured with `httpShouldSetCookies = true`, accept policy `always` and `HTTPCookieStorage.shared`; a request with `include` sets `httpShouldHandleCookies = true` and attaches the stored cookies, anything else sets it to `false` ([ExpoFetchModule.swift L118-133](https://github.com/expo/expo/blob/sdk-57/packages/expo/ios/Fetch/ExpoFetchModule.swift), [ExpoURLSessionTask.swift L17-35](https://github.com/expo/expo/blob/sdk-57/packages/expo/ios/Fetch/ExpoURLSessionTask.swift)) | The module's OkHttp client gets a `JavaNetCookieJar(ForwardingCookieHandler)` on create; a request whose `credentials` is not `include` is built with `CookieJar.NO_COOKIES` ([ExpoFetchModule.kt L26-50](https://github.com/expo/expo/blob/sdk-57/packages/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt), [NativeRequest.kt L39-43](https://github.com/expo/expo/blob/sdk-57/packages/expo/android/src/main/java/expo/modules/fetch/NativeRequest.kt)) |
| React Native `fetch` (`whatwg-fetch` over XHR) | `HTTPShouldHandleCookies` is set from `withCredentials`, and the session uses `sharedHTTPCookieStorage` ([RCTNetworking.mm L316-325](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/Libraries/Network/RCTNetworking.mm), [RCTHTTPRequestHandler.mm L92-101](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/Libraries/Network/RCTHTTPRequestHandler.mm)) | `withCredentials = false` builds the request with `CookieJar.NO_COOKIES`; otherwise the shared `ForwardingCookieHandler` jar ([NetworkingModule.kt L367-373](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/NetworkingModule.kt)) |

`ForwardingCookieHandler` forwards to `android.webkit.CookieManager` and calls
`flush()` after each `setCookie`, and its own docblock says it "relies on
CookieManager to persist cookies to disk so cookies may be lost if the
application is terminated before it syncs"
([ForwardingCookieHandler.kt L17-64](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/network/ForwardingCookieHandler.kt)).
Both fetch paths on a platform share one store, so switching
`EXPO_PUBLIC_USE_RN_FETCH` does not change any of this.

On `credentials`: `expo/fetch` maps `same-origin` to `include` and defaults to
`include`, and honours `omit`
([src/winter/fetch/fetch.ts L48-71 on sdk-57](https://github.com/expo/expo/blob/sdk-57/packages/expo/src/winter/fetch/fetch.ts)).
`whatwg-fetch` sets `withCredentials = true` for `include`, `false` for `omit`,
and leaves it alone for its default `same-origin`
([whatwg-fetch 3.6.20 fetch.js L587-591](https://unpkg.com/whatwg-fetch@3.6.20/fetch.js)),
and React Native's XHR defaults `withCredentials` to `true`
([XMLHttpRequest.js L157](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/Libraries/Network/XMLHttpRequest.js)).
React Native's docs still list "`credentials: 'omit'` does not work" under Known
Issues ([network.md](https://github.com/facebook/react-native-website/blob/main/docs/network.md));
the 0.86.3 source above says otherwise on both platforms. A device check should
settle which is right before anything depends on `omit` alone.

### Which credential each request carries, case by case

The device sends the cookie (if the jar has one) and the bearer (if SecureStore
has one) on every request. The server uses the cookie when present. So the
question "which one does each request carry" reduces to "is there a cookie in
the jar".

**Sign-in.** `POST /auth/sign-in` answers with `Set-Cookie` and
`x-simmer-session` from the same sealed session
([create-session-writer.ts L19-37](../../apps/server/src/auth/session/create-session-writer.ts)).
The jar and SecureStore agree. Any older cookie is replaced, since the name,
domain and path are the same.

**Rotation.** Only `/auth/me` refreshes. When it does, `setAuthCookie` writes
both from the rotated value (register-me.ts L27-29), and `authFetch` writes the
header to SecureStore. They agree unless one write is lost. The case to know is
the Android flush window above: if the process dies after SecureStore took the
rotated session and before `CookieManager` persisted it, the next launch has
the new session in SecureStore and the previous one in the jar. The server
reads the previous one. Its access token is likely expired by then, so `/auth/me`
refreshes it, which spends a refresh token WorkOS has already seen. I have not
measured how often this window is hit; it needs a device and a kill at the
right moment.

**Organization switch.** `POST /auth/switch-organization` reads the session
(cookie first), refreshes it with the new `organizationId`, and answers through
`respondAuthenticated`, which calls `finalizeSession` and so `setAuthCookie`
([respond-authenticated.ts L5-12](../../apps/server/src/auth/user-routes/respond-authenticated.ts)).
Both transports get Organization B's sealed session from the one response. A
refused switch writes nothing, and both still name A. So after a switch the
jar and the bearer cannot name different Organizations, unless the rotation
case above happens to land on the same response.

Requests already in flight when the switch lands were authorized as A and
finish as A. For a shape long poll that is harmless, because its response
belongs to A's shape (see question 2).

**Sign-out, online.** `signOut` posts `/auth/logout`
([packages/auth/src/client/operations/sign-out.ts L9-20](../../packages/auth/src/client/operations/sign-out.ts)).
The server revokes the WorkOS session, best effort, deletes the cookie, and
answers with a redirect to `appOrigin`, the web app
(register-logout.ts L18-25). The deletion rides on the `302`. Both platform
stacks store cookies from each hop of a followed redirect, so the jar is
cleared; the client then follows the redirect to the web origin and fetches its
HTML, which is wasted, and if the web origin is unreachable the fetch rejects
and `signOut` swallows it. Then SecureStore is cleared. Both are empty. That
storing on a `302` is platform behaviour I read but did not run, and it belongs
on the device checklist.

**Sign-out, when `/auth/logout` does not complete.** `signOut` catches the
failure and clears SecureStore anyway, by design ("an offline user still gets to
sign out"). The jar still holds the session, and the server never revoked it.
Then:

1. `AuthProvider.signOut` calls `controller.refresh()`
   ([apps/mobile/src/auth/auth-context.tsx L102-105](../../apps/mobile/src/auth/auth-context.tsx)).
   Offline, `/auth/me` throws, and `ask()` returns the previous snapshot without
   replacing it
   ([create-app-auth-controller.ts L76-93](../../packages/auth/src/client/create-app-auth-controller.ts)).
   The screen stays signed in.
2. Once a request reaches the server, it carries `x-simmer-client: token`, no
   bearer, and the cookie. `readSealedSession` reads the cookie. Shape and
   command requests authenticate while the access token is unexpired.
3. `/auth/me` authenticates the cookie, refreshing it if needed, and on a
   refresh answers with both `Set-Cookie` and `x-simmer-session`. `authFetch`
   writes the header into SecureStore
   (create-auth-fetch.ts L74-77).

The sign-out is undone, for whoever holds the device next. On a phone shared
across a crew, that is the second Collector working as the first. The same
happens online if the logout response is lost after the server acted on it
but before the client stored the deletion, though then the session is revoked
and only the unexpired access token is left to use.

**Session lost.** When `/auth/me` refuses, nothing clears either store, and
both hold the same dead value. The next sign-in overwrites both. Harmless.

### What would close it

These are options with their costs. Picking one is the sign-in ticket's
decision.

1. **Token clients get no cookie, and their cookie is not read.** In
   `writeSealedSession`, skip `setCookie` when `isTokenClient(context)`. In
   `readSealedSession`, read only the bearer when the request declares itself a
   token client. The second half matters because devices that already ran a
   build will have a cookie in the jar; without it, those cookies keep winning
   until they expire in 30 days. With both halves the bearer is the device's
   only credential, which is what ADR 0016 describes, and the sign-out and
   flush-window cases above disappear. The ADR's "alongside the `Set-Cookie` it
   would have sent anyway" line would need amending. `/auth/logout` for a token
   client could also answer `204` instead of redirecting to the web app.
2. **The token client sends `credentials: 'omit'`.** In `createAuthFetch`, when
   a `SessionTransport` is present. At source level both `expo/fetch` and React
   Native's fetch then neither send nor store cookies. It is the client-side
   half of the same fix, and alone it depends on the device confirming the
   source over React Native's Known Issues note. It needs a
   `session-credential-ignore` marker edit, since the literal changes.
3. **Clear the jar on sign-out.** React Native exposes `clearCookies` on its
   networking module, which deletes every cookie in the shared store
   ([RCTNetworking.mm L850-860](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/Libraries/Network/RCTNetworking.mm)).
   It works offline, which the server fix cannot help with for cookies already
   stored, but it treats a symptom and leaves the rotation case open.

Option 1 alone covers every case above for a fresh install; option 1 with
option 2 also stops the jar from filling at all.

A smaller thing turned up on the way. On React Native `platformLocks()` is
`null`, and `refresh()` runs `ask()` through `holdSessionLock` with no lock and
outside the in-process `serialize` chain that `renew()` and `exchange()` share
([create-app-auth-controller.ts L37-45, L64-70](../../packages/auth/src/client/create-app-auth-controller.ts),
[hold-session-lock.ts L14-16](../../packages/auth/src/client/hold-session-lock.ts)).
In a browser the Web Lock serializes the two; on a device a `refresh()` can run
beside a pending `renew()` and both can spend the refresh token. After sign-in
or a switch the token is fresh, so neither refreshes and the race is
theoretical there. It is worth a line in the sign-in ticket.

## Question 2: a saved handle under a different `where`

### What the proxy sends

The shape route forces `table`, `columns`, `where` and `params[1]` from the
session's Organization
([apps/server/src/sync-shapes.ts L143-169](../../apps/server/src/sync-shapes.ts))
and drops those keys if the caller sent them (`serverOwnedShapeParams` and the
`params[n]` pattern, L349, L368-370). Everything else, including `handle`,
`offset`, `live` and `cursor`, passes through to Electric unchanged (L219-227).
So a device that resumes with A's handle and offset after switching to B sends
Electric `handle=<A's>`, `offset=<A's>` and `where=organization_id = $1 ...`
with `params[1]=<B's id>`.

The proxy also rewrites Electric's cache headers to `private, no-store` with
`vary: cookie` (L284-326), so neither `NSURLCache` nor any HTTP cache on the
device can replay A's response for B's identical URL.

### What Electric answers

Read at the `@core/sync-service@1.8.1` tag:

- With a handle present, `get_or_create_shape_handle` calls
  `Shapes.resolve_shape_handle(stack_id, handle, shape)`
  ([api.ex L327-331](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/shapes/api.ex)).
- `resolve_shape_handle` keeps the given handle only when
  `ShapeStatus.validate_shape_handle` says it matches the shape; otherwise it
  looks up the handle for the shape the request describes, and returns `nil` if
  there is none
  ([shape_cache.ex L83-100](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/shape_cache.ex)).
- The match is `Shape.hash(shape) == hash` stored against that handle
  ([shape_status.ex L342-351](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/shape_cache/shape_status.ex)).
  The hash is over `Shape.comparable/1`, which includes the parsed `where`
  ([shape.ex L113-136](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/shapes/shape.ex)),
  and the parser substitutes `params` into the `where` when it validates it
  ([parser.ex L310-320](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/replication/eval/parser.ex)).
  Two Organization ids give two hashes.
- If B's shape does not exist yet, `handle_shape_info(nil, ...)` creates it and
  recurses (api.ex L341-350). Either way the result is B's handle, which is not
  the one the client sent, so the last clause answers with
  `Api.Error.must_refetch()`, status `409`, body
  `[{"headers":{"control":"must-refetch"}}]`, and B's handle in the response
  (api.ex L388-410,
  [error.ex L4-8](https://github.com/electric-sql/electric/blob/%40core/sync-service%401.8.1/packages/sync-service/lib/electric/shapes/api/error.ex)).
  The comment there says it is the same path a changed `where` on a dependent
  shape takes.

Electric's docs say the same thing from the client side: a `409` or a
`must-refetch` "tells the client to discard its local data and re-sync the
shape from scratch"
([shapes guide, "Why shape handles get deleted"](https://github.com/electric-sql/electric/blob/main/website/docs/sync/guides/shapes.md),
[HTTP API, control messages](https://github.com/electric-sql/electric/blob/main/website/docs/sync/api/http.md)).

So Electric does not serve A's shape to B, and does not answer B's request with
an empty change set at A's offset. It refuses the handle.

### What the client and the collection do with the 409

`ShapeStream` in 1.5.23, on a `409`:
([client.ts L1118-1144](https://unpkg.com/@electric-sql/client@1.5.23/src/client.ts))

1. marks the current handle expired under the shape's canonical key, which is
   the URL without Electric's protocol parameters (L629-640);
2. resets its state to the handle in the `409`, at offset `-1`;
3. publishes a synthetic `must-refetch` to subscribers;
4. requests again with a cache buster.

`electric-db-collection` 0.4.10, on `must-refetch`, resets the saved resume
marker, opens a sync transaction, truncates, clears its tag and key tracking,
and keeps accumulating until the next commit point
([electric.ts L2162-2195](https://unpkg.com/@tanstack/electric-db-collection@0.4.10/src/electric.ts)).
The transaction commits at B's `up-to-date` (L2206-2215). Until then the
collection's visible rows are A's. Online that is one snapshot's length. If the
device goes offline between the switch and B's snapshot, A's rows stay on
screen, under B's session, until it reconnects.

A detail for the switch-back case: the expired-handle cache keeps one handle per
canonical key, and the key is the same for every Organization. A new stream that
starts without a handle sends `expired_handle=<the last expired one>` (L1384-1388);
if the server then answers with that same handle, the client reads it as a stale
cache, retries with a cache buster up to three times, then self-heals by
clearing the entry and retrying without it (L742, L1475-1515). That costs a few
requests and a console warning, not correctness. On a device the cache is in
memory only, because `localStorage` is absent.

### With persistence

The saved resume state is accepted when its `shapeId` equals
`getStableShapeIdentity({ url, params })`
([electric.ts L563-573, L1677-1720](https://unpkg.com/@tanstack/electric-db-collection@0.4.10/src/electric.ts)).
`packages/sync` builds the URL from the server URL and the table's route, and
sends no Organization in it, by design, since the server forces the scope. So
the identity is the same under A and B, the saved state is accepted, and the
stream resumes with A's handle and offset. The first request answers `409` as
above. Before it does, and for as long as the device is offline, the persisted
rows loaded from SQLite are A's.

The options visible from here, for the spec to choose between:

- Key the persisted database by Account and Organization, so a switch or a
  different Collector opens a different file and A's rows never load under B.
  Sign-out then closes the file; whether it also deletes it is a retention
  question.
- Put the Organization in the shape's identity, by adding it to the URL the
  client builds. The proxy would have to accept and check it against the
  session, or strip it before Electric. This makes the saved state miss, so the
  collection starts with a full snapshot instead of a `409`, but the rows from A
  are still in the same tables until that snapshot commits.
- Truncate every persisted collection on a switch or sign-out, before any
  collection starts.

The first is the only one under which A's rows cannot render under B even
offline. The command queue
([#1335](https://github.com/thebigthing313/simmer-mosquito/issues/1335)) has
the same shape of problem: a command queued as A and sent after a switch goes
out under B's session, where its referenced ids belong to another Organization
and the reference gate refuses it. Keying the queue the same way, or holding
entries made under another Organization, avoids turning that into a Refused
command.

## Checks only a device can make

- That `Set-Cookie` from the server lands in the shared store under
  `expo/fetch` on both platforms and is sent back on the next request, which is
  what makes the sign-out case real.
- That the cookie deletion on the `302` from `/auth/logout` is stored before
  the redirect is followed.
- That `credentials: 'omit'` keeps cookies off a request and out of the store
  under both fetches, against React Native's Known Issues note.
- How often an Android kill lands between SecureStore taking a rotated session
  and `CookieManager` persisting it.
- That A's rows render under B until B's `up-to-date`, on an eager collection
  and an on-demand one.
