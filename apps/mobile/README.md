# @simmer-mosquito/mobile

The SIMMER field app. Expo managed React Native (SDK 57) with expo-router, per
ADR 0006.

## What exists

A scaffold, deliberately shallow: the app boots, signs in against the real
`apps/server` `/auth/*` endpoints, keeps the session in SecureStore, and renders
the resolved `AuthContext` from `/auth/me`.

There is **no Electric, no TanStack DB, no offline persistence, and no map**.
The per-table mobile sync policy in `docs/sync.md` — eager traps, progressive
habitats, three-year history windows — is the plan for what comes next, not a
description of this app.

## Running it

The app needs `apps/server` up. From the workspace root, in two terminals:

```bash
pnpm dev
```

```bash
pnpm dev:mobile
```

Not in `mprocs.yaml` on purpose: Expo's CLI is interactive and prints a QR code
that a narrow pane mangles.

Then scan the QR code with Expo Go. **Expo Go is enough today** and will stay
enough until the first native module lands — Mapbox or SQLite persistence,
whichever comes first. At that point this becomes an `expo-dev-client` build and
the QR-code instructions above change.

### Pointing it at the server

`EXPO_PUBLIC_SERVER_URL` defaults to `http://localhost:3000`, which is correct
in the iOS simulator and wrong on a physical phone — `localhost` there is the
phone. Put your machine's LAN address in `apps/mobile/.env.local`:

```
EXPO_PUBLIC_SERVER_URL=http://192.168.1.50:3000
```

Use the plain server port, not the Caddy HTTPS origin the browsers use: Expo Go
will not accept the local self-signed certificate.

## Layout

```
src/app/          expo-router routes — _layout (the auth gate), sign-in, index
src/auth/         session store, client binding, React context
src/components/   app-local UI
src/theme/        design tokens, in the shape React Native reads
src/tests/unit/   mirrors src, per the workspace convention
```

There is no `packages/ui-mobile` yet. ADR 0006 names one and it should exist —
once there is a second consumer or a component earns reuse. An empty package
with a build edge would not.

## Session handling

The app holds the same sealed WorkOS session the web apps hold, carried as an
`Authorization: Bearer` credential instead of a cookie (ADR 0013). Both halves
of that are load-bearing:

- `src/auth/session-store.ts` is the keystore, and caches reads so one sign-in
  does not become a native round trip per HTTP call.
- `packages/auth`'s `authFetch` captures the rotated session the server returns
  in `x-simmer-session`. Without it a session works until WorkOS first rotates
  it, then fails on a delay with nothing at the failure site to explain why.
