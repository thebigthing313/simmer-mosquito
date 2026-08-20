# Web client persistence

`apps/web` does not persist collections to the client. No IndexedDB, no
localStorage, no stored Electric offset. Every page load rebuilds every
collection in memory from the shape snapshot.

Persistence is a **field app** concern. It is planned for `apps/mobile` and
only for `apps/mobile`.

## Why this is out of scope

The two surfaces do different jobs, and ADR 0006 splits them on purpose:
`apps/web` is a dense agency management console, `apps/mobile` is the
field-focused data-entry app. Persistence follows that split.

A field collector works where the network does not. Their device is their own,
they stay signed in to one agency, and the data they need is a known, bounded
baseline. `docs/architecture.md` already scopes what mobile should persist: the
field-critical baseline for the selected organization after sign-in, then
work-scoped data as it loads, and never the whole organization database.

An agency manager on the web app works at a desk with a network. Their session
is browser-based, often on a shared or borrowed machine, and their queries range
across the whole organization rather than one route's worth of work.
`docs/architecture.md` states the position outright: the web app is online-only
in v1, with no offline persistence, no offline command queue, and no offline
conflict resolution.

Building it on web would buy a faster cold load and cost:

- **Per-tenant isolation on a shared machine.** A stored collection outlives the
  session that fetched it. Operators switch agencies (`POST
  /auth/switch-organization`), and a persisted store would have to be keyed and
  cleared per agency, per user, on sign-out and on membership end.
- **Stale reads against a server-authorized shape.** The server authorizes every
  sync shape before Electric streams. A stored offset is a claim about what a
  session was allowed to see, replayed after the authorization that granted it
  may have changed.
- **Storage limits over an unbounded query surface.** Mobile persists a bounded
  baseline. The web app's reads are not bounded that way.

None of that is unsolvable. It is the wrong trade for a surface that already has
a network.

## What this does not cover

The cold-load cost is real and accepted, not denied. Reducing it by other means
stays in scope: fewer eager shapes before first paint, narrower snapshot
columns, better skeletons, or deferring on-demand subset POSTs.

HTTP caching is not one of those means. Electric's log is immutable per
`(handle, offset)`, so segment responses could be cached safely, but the
expensive request is `offset=-1`, which is "the snapshot as of now" and must
never be cached. Caching it once served month-old snapshots at month-old log
offsets and desynced the Electric client, which is why those responses are now
`private, no-store` (d0e9b25). Do not reintroduce it.

## Prior requests

- #84 "Every cold load refetches every shape snapshot because nothing persists collections"
