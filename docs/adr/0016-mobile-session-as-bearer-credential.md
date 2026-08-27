# ADR 0016: The Mobile Session Is The Same Sealed Session, Carried As A Bearer Credential

Status: Accepted

Date: 2026-08-11

## Context

`apps/server` authenticates every request from a WorkOS sealed session that
`apps/web` and `apps/admin` hold in an httpOnly cookie. ADR 0010 moved the
sign-in UI in-app; the transport did not change, because both clients are
browsers.

`apps/mobile` is not. React Native has no cookie jar worth depending on, and
`docs/architecture.md` has named a SecureStore-backed session as the field app's
credential store since before the app existed, but it described it as a "future
mobile session exchange", which left open whether mobile would get its own token
format, its own endpoints, and its own refresh rules.

Three options were on the table:

1. Reuse the sealed session, carried as `Authorization: Bearer`.
2. A dedicated `/auth/mobile/*` exchange issuing SIMMER's own token.
3. Make React Native carry the existing cookie.

## Decision

Option 1. The mobile session **is** the web session; only the transport differs.

- `readSealedSession` accepts the credential from either the cookie or an
  `Authorization: Bearer` header, cookie first.
- A client that cannot use cookies declares itself with `x-simmer-client: token`.
  The server then returns the sealed session, including every rotation WorkOS
  performs, in an `x-simmer-session` response header, alongside the `Set-Cookie`
  it would have sent anyway.
- That header is emitted **only** to a declared token client. Emitting it
  unconditionally would hand the sealed session to any script running in the web
  apps and make `httpOnly` decorative.
- `createAuthClient` in `packages/auth` takes an optional `SessionTransport`.
  `apps/mobile` passes a SecureStore-backed one; the web apps pass nothing and
  are unchanged.

`apps/server/src/auth-session-transport.ts` is the only module that knows any of
this. Every route reaches it through `readSealedSession`/`writeSealedSession`.

## Consequences

- One session model, one set of `/auth/*` endpoints, one set of outcome unions.
  There is no second thing that can expire, refresh, or be revoked differently.
- WorkOS remains the sole revocation authority, as ADR 0011's offboarding work
  depends on. Ending a membership kills the mobile session for the same reason
  it kills the web one.
- Rotation is handled in one place, the client's `authFetch`, rather than at
  each call site. This was the failure mode the design most needed to close: a
  rotated session returned only as a cookie leaves a bearer client holding a
  stale credential, and the app breaks minutes or hours after a sign-in that
  looked perfect.
- The sealed session is at rest in the device keystore rather than in an
  httpOnly cookie. That is a real difference in exposure, and it is the reason
  SecureStore is required rather than AsyncStorage.
- A future non-browser client (a CLI, an integration) has a transport already.
- Not done here: device binding, per-device revocation, and a mobile-side
  refresh-ahead. All three are additive and none of them need a second token
  format.
