# Handoff: why write-confirmation (txid) round-trips are slow / missing — and is it a prod risk?

**Status:** investigation scaffolding for a dedicated session. Nothing here is a
committed conclusion except where it cites code. Verify claims against current code
(`git log` may have moved things).

**The question to answer:** the region **import** page could hang in "Importing"
because `regions.insert(...).isPersisted.promise` never (or slowly) resolved. We
already shipped a client-side mitigation (bounded timeout + concurrency + progress —
commit `ee16206`). But the underlying issue — the write's **txid not coming back in
time** — persists even though ElectricSQL now runs on remote Railway staging instead
of the laptop. **Do we have to keep worrying about this in production?**

---

## TL;DR of current understanding

1. **`isPersisted` couples two very different things:** (a) the server accepting the
   write (HTTP POST returns `{ txid }`), and (b) that same txid being observed coming
   back down the client's **live Electric shape stream**. Only (b) is flaky.
2. **It is almost certainly NOT an infinite hang at the sync layer.** The library
   (`@tanstack/electric-db-collection@0.3.12`) gives `awaitTxId` a **5s default
   timeout that _rejects_** (`TimeoutWaitingForTxIdError`). The only way to hang
   *forever* is the `onInsert` **fetch itself** never returning (server unreachable /
   holding the connection) — a server/topology problem, not Electric. See
   [Two failure modes](#two-distinct-failure-modes).
3. **Dev topology ≠ prod topology, and this is the single biggest reason to expect
   prod to be better.** Today a **laptop-hosted server** talks to a **public staging
   Electric across the internet**; prod runs Electric **private and co-located** with
   the server on Railway's internal network. The txid round-trip in dev crosses the
   internet twice; in prod it does not. (`docs/deployment.md` lines ~30–39.)
4. **But there are two architecture-level risks that _would_ follow us to prod** and
   deserve de-risking: (i) Electric **replication lag > 5s** under bulk-insert
   pressure, and (ii) whether a txid for a **newly-inserted row is ever observed on an
   _on-demand subset_ shape** that doesn't include that row (the `regions` collection
   is `on-demand`). See [Ranked hypotheses](#ranked-hypotheses).

**Provisional answer:** the acute "stuck importing" is dominated by dev topology +
the missing client timeout (now fixed) + no progress UI making a slow-but-finite loop
*look* hung. Prod is structurally much better, **but do not assume write→confirm is
sub-5s under bulk load until hypotheses H2/H3 are tested.**

---

## How write-confirmation actually works (the pipeline)

```
UI insert (optimistic apply, instant)
  └─ webCollections.regions.insert(row, { metadata:{ geometry } })
       └─ wrappedOnInsert  (electric-db-collection wraps our handler)
            ├─ our onInsert: POST /foundation/regions  → server
            │     server commits in a Kysely txn, then:
            │       select pg_current_xact_id()::xid::text as txid   ← 32-bit xid
            │     returns { txid }
            └─ processMatchingStrategy({ txid })
                 └─ awaitTxId(txid, timeout=5000)   ← REJECTS after 5s if unseen
                      resolves only when `txid` appears in `seenTxids`,
                      which is fed from live shape-stream messages whose
                      headers carry `txids: [...]`
  isPersisted.promise resolves  ⇐ only after BOTH the POST and awaitTxId resolve
```

Client live stream path (how the txid gets back):
```
browser  ──GET /sync/shapes/regions?live=true&offset=..&handle=..──▶  Hono server
         (server authorizes + forces table/columns/where, proxies to Electric)      ──▶ Electric ──▶ Postgres logical replication
```

### Code references (verify line numbers)
- **Client collection wiring:** `packages/sync/src/index.ts` → `electricShapeCollectionOptions` (~L147). Live stream stays **GET**; subset snapshots are **POST** (`subsetMethod:'POST'`).
- **Our mutation handlers (return `{ txid }`, no `timeout`):**
  `apps/web/src/sync/foundationGeographyMutations.ts` → `createRegionMutationHandlers` / `createRecordHandlers.onInsert` (~L45). `writeRecord` does the `fetch` (~L182).
- **Server txid generation:** `apps/server/src/foundation-geography-commands.ts` → `readCurrentTransactionId` (~L766): `select pg_current_xact_id()::xid::text`. Same pattern repeated across command files.
- **Shape proxy / param forwarding / CORS expose:** `apps/server/src/sync-shapes.ts` — `buildElectricShapeRequest` (~L606), `proxyElectricShape` (~L667), `electricExposeHeaders` (~L744, exposes `electric-offset/handle/cursor` — **already correct**, so the browser *can* follow the log cursor; rule this out).
- **Library timeout behavior:** `node_modules/.pnpm/@tanstack+electric-db-collection@0.3.12_*/dist/esm/electric.js` — `awaitTxId` (~L215, `timeout = 5e3`, rejects with `TimeoutWaitingForTxIdError`), `processMatchingStrategy` (~L341, `timeout = result.timeout` → undefined → default 5s), `hasTxids` (~L61, reads `message.headers.txids`).
- **`regions` is on-demand:** `packages/sync/src/descriptors/regions-sync-descriptor.ts` (`syncMode: 'on-demand'`).
- **Topology:** `docs/deployment.md` (prod: `electric.railway.internal:3000`, `ELECTRIC_INSECURE=true`; staging: public domain + `ELECTRIC_SECRET`; local server → staging Electric over the internet). Secret folding: `apps/server/src/env.ts` → `readElectricUrl` (~L118).

---

## Two distinct failure modes

| | **Mode A: onInsert fetch hangs** | **Mode B: awaitTxId times out** |
|---|---|---|
| Cause | POST to command endpoint never returns (server unreachable, connection held, laptop↔staging network stall) | POST returns `{txid}` fine, but the txid is never observed on the live stream within 5s |
| `isPersisted` | **never settles** (true infinite hang) | **rejects at ~5s** with `TimeoutWaitingForTxIdError` |
| Old import UX | frozen "Importing" forever | 5s × N serial, no progress → *looks* hung, ends "N of N failed" |
| Which one did the user hit? | **unknown — determine this first** | possibly, or just perceived-hang |

**Our shipped fix** (`import.tsx`): outer 15s `Promise.race` per item + concurrency 6 +
progress bar. It converts Mode A into a bounded "pending" and shows progress for both.
**Caveat introduced:** the library's inner 5s reject (Mode B) now surfaces as our
**"failed"** bucket (settled `{error}` before our 15s outer timeout), *not* "pending".
If Mode B is the real prod behavior, we may want to (a) pass a longer `timeout` via the
handler result — the lib honors `result.timeout` (see `processMatchingStrategy`) — or
(b) stop awaiting sync for bulk writes entirely (await only the server 200 and let
background sync reconcile). See [Design levers](#design-levers).

---

## Ranked hypotheses (with prod-risk verdict)

**H1 — Dev topology latency (laptop server ↔ public staging Electric over the internet).**
Round-trip crosses the internet twice; TLS + Railway ingress + `ELECTRIC_SECRET` public
edge add latency and flakiness that the co-located prod path (internal network,
`ELECTRIC_INSECURE`) does not have. Memory notes ("live=true 503s; needs docker
restart", "deployed staging sync intentionally broken") point at exactly this.
→ **Prod risk: LOW.** Largely a dev artifact. *Most likely dominant cause.*

**H2 — Electric replication lag > 5s under bulk-insert pressure.**
A 1000-polygon import fires many commits fast; Electric ingests WAL asynchronously and
must publish each txid to the shape log. Cold Electric, WAL backlog, or an
under-provisioned instance can push confirmation past the 5s default even with perfect
networking. Co-located prod is faster but **not immune under bursty bulk load.**
→ **Prod risk: MEDIUM** for bulk operations specifically; low for single writes.

**H3 — txid not observed on an _on-demand subset_ shape.**
`regions` is `on-demand`. `awaitTxId` only resolves when the txid shows up in
**`seenTxids`**, fed from live-stream messages carrying `headers.txids`. Open question:
does Electric stamp `txids` on a shape's control/`up-to-date` message for a write that
**did not match that shape's where-clause**, and **is a live regions shape even
subscribed while sitting on the import page** (which only inserts)? If a newly-inserted
id is in no active subset AND non-matching writes don't carry txids, confirmation can
**never** arrive → deterministic 5s timeout, independent of latency, **in prod too.**
→ **Prod risk: MEDIUM–HIGH if confirmed.** This is the most important one to test.
(Counter-evidence: single-region create in `create.tsx` uses the same pattern and
reportedly works — figure out *why* it differs. Likely the index/detail pages hold an
org-scoped live shape that DOES match new rows, while the import page holds none.)

**H4 — txid format mismatch (`pg_current_xact_id()::xid` 32-bit truncation).**
`pg_current_xact_id()` returns non-wrapping `xid8` (64-bit); the `::xid` cast truncates
to 32-bit. If Electric reports txids in a different width/representation than what
`Number.parseInt` yields here, matches would **always** fail → every write times out.
That would be a constant, obvious failure though (not intermittent), so it's likely
*correct* today — but confirm the two representations actually equal each other.
→ **Prod risk: LOW if it works at all, but a latent footgun** on any Electric upgrade.

---

## Experiments for the next session (in order)

1. **Classify the failure (A vs B).** Reproduce the import with DevTools Network open.
   - Do the `POST /foundation/regions` calls **return** (200 + `{txid}`)? If some never
     return → **Mode A** (server/network). If they return fast but the item still
     stalls → **Mode B** (sync).
2. **Turn on the collection's debug logs.** The lib logs `awaitTxId called with txid
   %d`, `awaitTxId found match for txid`, and timeout rejections. Enable debug
   (`localStorage.debug = '@tanstack/*'` or the lib's namespace) and watch: is the txid
   ever "seen", and after how long? This directly separates *slow* from *never*.
3. **Is a live regions shape even open on the import page?** Network tab: look for
   `GET .../sync/shapes/regions?...live=true...` while on `/gis/regions/import`. If
   absent, H3 is essentially confirmed (no observer → nothing can deliver the txid).
4. **Single vs bulk.** Create one region via `/gis/regions/create` and watch the same
   logs. If single confirms but import doesn't, the difference is the active shape
   subscription (H3), not Electric health.
5. **Measure Electric replication lag on staging directly.** Hit Electric's shape
   endpoint / metrics; compare commit time vs when the txid appears in the shape log.
   Quantifies H2. (Railway logs for the Electric service; `mcp__railway__get_logs`.)
6. **Verify txid representation (H4).** In psql: `select pg_current_xact_id(),
   pg_current_xact_id()::xid::text;` and compare against the `txids` header value in a
   live shape message for a known write.
7. **Confirm prod topology assumption.** Re-read `docs/deployment.md` + Railway prod
   service config: Electric private + co-located + `ELECTRIC_INSECURE`. Optionally
   measure a real write→confirm round-trip in a prod-like (internal-network) setup.

---

## Design levers (independent of root cause)

- **Longer await window for bulk:** our handlers can return `{ txid, timeout }`; the lib
  passes `result.timeout` into `awaitTxId`. Bump it for imports if H2 is real.
- **Don't sync-confirm bulk writes at all:** for imports, await only the server 200 and
  let normal background sync reconcile the rows into the list. Removes the txid round
  trip from the critical path entirely; the current client fix already tolerates this
  by treating unconfirmed-but-submitted as "pending".
- **Single batched command:** one endpoint that inserts N regions in one txn → one txid
  to await instead of N. Fewer round-trips, less Electric pressure (helps H2).
- **Reconsider `regions` sync mode / subscription for the import flow** if H3 holds
  (e.g. briefly subscribe to an org-scoped regions shape during import so txids are
  observed).

---

## Open questions to resolve
- Does Electric include `headers.txids` on a shape's `up-to-date`/control message for
  writes that **don't match** that shape? (Determines H3.)
- Why does single-region create work but bulk import doesn't — different active shape,
  or just N× the 5s penalty made it *look* different?
- Is the current staging hang purely operational (needs Electric restart / PORT/secret
  config per the local-dev-on-staging memory) vs. a code issue?
- After any Electric version bump, does `::xid` still match Electric's reported txid?

## Related memory / prior art
- `local-dev-on-railway-staging` — DB+Electric on Railway staging; `ELECTRIC_SECRET`
  forwarding + `PORT=3000` routing gotcha; "deployed staging sync intentionally broken".
- `handoff-post-subset-and-consumer-refactor` — sync mental model; "live-push
  edit-reflection blocked by env (Electric live=true 503s; needs docker restart)".
- `larval-overview-nested-includes` — "Electric docker restart clears workspace hangs".
- `gis-subdomain-buildout` — the import feature + the client-side fix (commit `ee16206`).
