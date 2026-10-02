# Persistence for TanStack DB on React Native

Research for [Research: persistence for TanStack DB on React Native](https://github.com/thebigthing313/simmer-mosquito/issues/1331),
under [Map: the v1 field app in apps/mobile](https://github.com/thebigthing313/simmer-mosquito/issues/1330).
Nothing here is built and nothing was run on a device. Every claim below is read
from npm registry metadata, the published package source (each tarball ships
`src/`, linked through unpkg at the exact version), the TanStack DB docs on
`main`, or the Expo SDK 57 docs, read on 2026-10-01. Where a claim needs a device
to settle, it says so.

This is facts, not a decision. The decisions belong to the map's tickets on
which rows reach the device and on the offline command queue.

## The answer

TanStack ships SQLite persistence for collections and a separate outbox package
for queued writes, and both run on React Native. Neither fits the workspace as it
stands without work:

- The Expo adapter, `@tanstack/expo-db-sqlite-persistence`, gained Expo SDK 57
  support on 2026-09-30 in 0.2.25, which requires `@tanstack/db@0.11.0`. The
  version that matches the workspace's `@tanstack/db@0.9.2` is 0.2.23, which
  declares `expo-sqlite ^55.0.10` and fails `tsc` against SDK 57's
  `SQLiteDatabase`. Using it on SDK 57 means either moving the three TanStack DB
  packages to 0.11.0 together or bridging the type by hand.
- Persisted rows live in one SQLite file through `expo-sqlite`, survive the app
  being killed, and load with no network. The Electric collection stores its
  shape offset and handle beside the rows, so it resumes rather than
  re-snapshots.
- Nothing in TanStack prunes rows. The only pruning is of an internal applied
  transaction log.
- `@tanstack/offline-transactions` has a React Native entry point but no React
  Native store: on a device it finds neither IndexedDB nor `localStorage` and
  drops to online-only unless the app passes a storage adapter.
- Its outbox drops each mutation's `metadata` when it writes to storage. SIMMER
  puts the domain command (`intents`, arguments, acknowledgements, location
  source) in exactly that field, so a write queued offline and replayed after a
  restart reaches `commandRequestFor` with no `intents` and is refused. The
  transaction-level `metadata` does survive.

## What the workspace has today

| Package | Declared | Resolved in `pnpm-lock.yaml` |
| --- | --- | --- |
| `@tanstack/db` | `^0.9.2` in `apps/web`, `apps/admin`, `packages/sync` | 0.9.2 |
| `@tanstack/react-db` | `^0.4.1` in `apps/web`, `apps/admin` | 0.4.1 |
| `@tanstack/electric-db-collection` | `0.4.10` in `packages/sync` | 0.4.10 |
| `expo` | `~57.0.12` in `apps/mobile` | |
| `react-native` | `0.86.3` in `apps/mobile` | |

Only `electric-db-collection` is pinned exactly. The other two are caret ranges
held at 0.9.2 and 0.4.1 because `electric-db-collection@0.4.10` depends on
`@tanstack/db` `0.9.2` exactly. `apps/mobile` depends on none of them yet, and
has no `expo-sqlite`.

Every TanStack DB satellite package depends on one exact `@tanstack/db`, so a
version of `@tanstack/db` selects one version of each. Read from
[the registry](https://registry.npmjs.org/@tanstack/db-sqlite-persistence-core):

| `@tanstack/db` | published | `react-db` | `electric-db-collection` | `db-sqlite-persistence-core` | `expo-db-sqlite-persistence` (peer `expo-sqlite`) | `offline-transactions` |
| --- | --- | --- | --- | --- | --- | --- |
| 0.9.2 | 2026-09-14 | 0.4.1 | 0.4.10 | 0.2.23 | 0.2.23 (`^55.0.10`) | 1.0.56 |
| 0.11.0 | 2026-09-30 | 0.5.0 | 0.5.1 | 0.4.0 | 0.2.25 (`^55.0.10 \|\| ^57.0.0`) | 1.0.58 |

There is no 0.10.x on npm; the [`@tanstack/db` changelog](https://github.com/TanStack/db/blob/main/packages/db/CHANGELOG.md)
has a 0.10.0 entry, but the registry goes from 0.9.2 to 0.11.0. That entry
deprecates returning `{ txid }` from an Electric handler in favour of awaiting
`collection.utils.awaitTxId`, raises the default `awaitTxId` timeout to 15
seconds, and tightens `Collection.update` key types. 0.11.0 adds the
`initialRender` option described below.

Expo SDK 57's [`bundledNativeModules.json`](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json)
pins `expo-sqlite ~57.0.3`, `@react-native-community/netinfo 12.0.1` and
`@react-native-async-storage/async-storage 2.2.0`. It lists neither
`@op-engineering/op-sqlite` nor `react-native-mmkv`.

## Which persistence adapter exists, on which store

TanStack DB's [SQLite persistence guide](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md)
lists one core package and a runtime wrapper per platform. Two target React
Native:

| Package | Store | Native module | Version at `db@0.9.2` |
| --- | --- | --- | --- |
| `@tanstack/expo-db-sqlite-persistence` | `expo-sqlite` async API | in the Expo SDK | 0.2.23 |
| `@tanstack/react-native-db-sqlite-persistence` | `@op-engineering/op-sqlite ^15.2.5` | not in the Expo SDK, so a development build | 0.2.23 |

There is no TanStack adapter for MMKV, AsyncStorage or any key-value store for
collection rows. A [registry search](https://registry.npmjs.org/-/v1/search?text=%40tanstack%20persistence)
turns up browser (wa-sqlite), Node, Electron, Capacitor and the two above.
MMKV could only back the outbox (below), through a hand-written storage adapter.

### The SDK 57 gap

[TanStack/db#1888](https://github.com/TanStack/db/issues/1888), filed
2026-09-25 against `expo-db-sqlite-persistence@0.2.23` and `expo-sqlite@57.0.3`,
reports two things. The peer range excludes SDK 57, and `tsc --strict` fails with
`TS2322` because the adapter's `ExpoSQLiteDatabaseLike` types `getAllAsync` and
`runAsync` params as `ReadonlyArray<unknown> | Record<string, unknown>` while
SDK 57 narrows them to `SQLiteBindParams`. The reporter bridged it with a wrapper
that validates bind values. [TanStack/db#1906](https://github.com/TanStack/db/pull/1906)
fixed both, merged 2026-09-27, and shipped in 0.2.25 on 2026-09-30, which depends
on `db-sqlite-persistence-core@0.4.0` and so on `@tanstack/db@0.11.0`. The
maintainer's closing note says native iOS and Android tests did not run for that
change. The workspace's `.npmrc` sets `strict-peer-dependencies=false`, so the
peer mismatch on its own would warn rather than fail an install.

### How it stores rows

Read from `db-sqlite-persistence-core@0.2.23`
([`sqlite-core-adapter.ts`](https://unpkg.com/@tanstack/db-sqlite-persistence-core@0.2.23/src/sqlite-core-adapter.ts),
[`persisted.ts`](https://unpkg.com/@tanstack/db-sqlite-persistence-core@0.2.23/src/persisted.ts)):

- One SQLite database, one `createExpoSQLitePersistence({ database })` shared by
  every collection
  ([README](https://unpkg.com/@tanstack/expo-db-sqlite-persistence@0.2.23/README.md)).
- Each collection gets its own table, `key TEXT PRIMARY KEY, value TEXT,
  metadata TEXT, row_version INTEGER`, plus a tombstone table. A row is stored as
  JSON text in `value`.
- Shared tables hold the collection registry, `collection_metadata`, an
  `applied_tx` log, `collection_version`, and a schema version.
- When a collection declares an index, `ensureIndex` creates a SQLite expression
  index over `json_extract(value, ...)` for it.
- The Expo driver ([`expo-sqlite-driver.ts`](https://unpkg.com/@tanstack/expo-db-sqlite-persistence@0.2.23/src/expo-sqlite-driver.ts))
  serializes every call through one promise queue and runs transactions through
  `withExclusiveTransactionAsync`.
- Each collection carries a `schemaVersion`. On a mismatch, the default policy
  for a collection with `sync` is to delete its rows and let the source reload
  them.

### Wrapping an Electric collection

`persistedCollectionOptions({ ...electricCollectionOptions(...), persistence,
schemaVersion })` keeps the source's sync and writes what it applies into
SQLite. The guide calls this `sync-present` mode. In that mode SQLite holds the
rows the source has applied, not optimistic state: local inserts, updates and
deletes still go out through the source's mutation handlers.

The wrapper respects `syncMode`, defaulting to `eager`
(`persisted.ts`, `syncOptions.syncMode ?? 'eager'`):

- `eager`: at start, `hydrateBaseline` loads every stored row of the collection
  into memory before sync continues.
- `on-demand`: `loadSubset` first reads the rows matching the live query's
  predicate out of SQLite, then asks the source for the same subset. The
  predicate compiles to SQL over `json_extract`, with an in-memory filter for any
  expression the compiler does not support.

## Does it survive a kill and restart offline

What the source shows:

- Rows. The file lives where `expo-sqlite` puts it. The
  [Expo SDK 57 SQLite docs](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/)
  call out Apple TV as the one platform where the file sits in the caches
  directory instead of the application documents directory. On start an `eager`
  collection hydrates from that file with no network call.
- The Electric position. `electric-db-collection@0.4.10`
  ([`electric.ts`](https://unpkg.com/@tanstack/electric-db-collection@0.4.10/src/electric.ts))
  writes an `electric:resume` entry, `{ offset, handle, shapeId }`, into
  collection metadata. The persisted wrapper saves collection metadata to
  `collection_metadata` and restores it at start (`loadStartupMetadataInternal`),
  so the next connection resumes the shape from that offset. If the stored
  position is unusable, Electric falls back to a full snapshot.
- Readiness. 0.11.0 adds `initialRender: { strategy: 'network-first',
  networkTimeoutMs }` and `isPersistedReady` on live queries, so a screen can
  render restored rows when the network does not answer in time (default three
  seconds). The guide says this needs an eager collection and does not support
  `on-demand`. At 0.9.2 the option does not exist.

What needs a device to settle: in 0.9.2, an `on-demand` `loadSubset` that
hydrates from SQLite and then fails to reach the source logs, queues a retry and
rethrows (`persisted.ts`, `loadSubset`). The comment says "Hydration remains
readable, but it does not satisfy remote demand." What a live query over an
offline on-demand collection then shows was not tested here.

TanStack runs the Expo package's conformance suite against Node, plus iOS
Simulator and Android Emulator paths
([README, E2E](https://unpkg.com/@tanstack/expo-db-sqlite-persistence@0.2.23/README.md)).

## Holding the row counts the mobile matrix implies

TanStack publishes no row-count limits or benchmarks for SQLite persistence, in
the guide, the package READMEs or the changelogs. The figures that bear on it:

- The mobile matrix in `docs/sync.md` asks for traps and control catalogs eager,
  habitats progressively up to the whole catalog, and three years of collections,
  inspections, control actions, assignments and missions.
- `docs/research/full-history-clone-cost.md` measured prod on 2026-08-31: 417
  traps, and over the last three years 106,774 of 517,348 inspections and 55,411
  of 245,218 applications. Those are whole-database counts, not one
  Organization's.
- In `eager` mode every stored row of a collection is held in JavaScript memory
  after start, so a three-year window on an eager collection is a three-year
  window in the JS heap. `on-demand` keeps the rows in SQLite and loads only what
  live queries ask for.
- Rows are JSON text, so each read parses JSON. A query predicate on a field
  without a declared index scans the table through `json_extract`.
- `@tanstack/db@0.11.0` lists "Speed up large collection sync batches by
  deferring row ordering until the batch completes" and an index suggestion for
  large collections.

Whether a mid-range phone holds 100,000 inspections in an eager collection, and
how long a first snapshot of that size takes to write through one serialized
`expo-sqlite` connection, has to be measured on a device.

## Pruning older rows

Nothing in `db-sqlite-persistence-core@0.2.23` removes rows on age or count.
Read from `sqlite-core-adapter.ts`, the only pruning is of the `applied_tx` log,
capped by default at 1,000 entries and 24 hours (`appliedTxPruneMaxRows`,
`appliedTxPruneMaxAgeSeconds`). Rows leave SQLite in three ways:

- the source syncs a delete for them,
- the source truncates the collection, as Electric does on a `must-refetch`,
  which runs `DELETE FROM` on the collection table,
- a `schemaVersion` mismatch resets the collection.

`unloadSubset` drops a subset from the wrapper's active set and deletes nothing
from SQLite. `PersistedCollectionUtils` exposes `acceptMutations`,
`getLeadershipState` and `forceReloadSubset`, and none of them deletes a row
locally. A delete through the collection API on a synced collection is a mutation
sent to the server. So a retention window is SIMMER's to build, as `docs/sync.md`
already says, and since the wrapper never deletes rows on its own it has no
check against pending mutations either.

## Queued mutations: `@tanstack/offline-transactions`

### It runs on React Native

The package ships `@tanstack/offline-transactions/react-native`, whose
`startOfflineExecutor` uses `ReactNativeOnlineDetector` (NetInfo plus `AppState`)
in place of browser events
([`react-native/OfflineExecutor.ts`](https://unpkg.com/@tanstack/offline-transactions@1.0.56/src/react-native/OfflineExecutor.ts)).
`react-native >=0.70.0` and `@react-native-community/netinfo >=11.0.0` are
optional peers. Leader election falls back to "always leader" when neither Web
Locks nor BroadcastChannel exists, which is the case on a device.

### Where it stores queued transactions

Nowhere, by default, on a device. `OfflineExecutor.createStorage` probes
IndexedDB, then `localStorage`, and when both fail it runs online-only and calls
`onStorageFailure`
([`OfflineExecutor.ts`](https://unpkg.com/@tanstack/offline-transactions@1.0.56/src/OfflineExecutor.ts)).
The package README's line "Uses AsyncStorage or custom storage adapters" is not
what the code does: no AsyncStorage adapter is exported.

The [offline transactions guide](https://github.com/TanStack/db/blob/main/docs/guides/offline-transactions.md#react-native-and-expo)
has the app pass `storage`, an object with `get`, `set`, `delete`, `keys` and
`clear`, and links an
[`AsyncStorageAdapter`](https://github.com/TanStack/db/blob/main/examples/react-native/offline-transactions/src/db/AsyncStorageAdapter.ts)
to copy into the app. A custom adapter is not probed, and `waitForInit()` rejects
if the first outbox read fails. Each transaction is one key, `tx:<id>`, holding
JSON.

Two stores in the Expo SDK fit that interface without a new native module, both
from the [Expo SQLite docs](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/):
`expo-sqlite/kv-store`, a SQLite-backed drop-in for the AsyncStorage API, and
`expo-sqlite/localStorage/install`, which installs `globalThis.localStorage`. The
second one would make the executor's own `localStorage` probe succeed with no
adapter at all. That was not tried. The guide's combined recipe keeps rows in
op-sqlite and the outbox in AsyncStorage, two stores, and its Electron example
backs the outbox with a separate SQLite table.

### Behaviour that matters for a queue

From the guide and source at 1.0.56:

- One transaction at a time, in creation order.
- The outbox entry is written before the mutation function runs. After a
  restart the leader restores the optimistic state of stored transactions
  (`registerRestorationTransaction`).
- Each transaction carries a stable `idempotencyKey`; the guide says the server
  must treat repeats as one mutation, because a crash can replay a request the
  server already applied.
- `NonRetriableError` drops the entry and rolls back the optimistic state; any
  other error retries with backoff.
- Stored entries name their mutation function and their collections by registry
  key, so both have to stay stable across releases, or the app migrates them.
  `onUnknownMutationFn` reports an entry whose function is gone.

### Domain commands versus row patches

A stored transaction is
([`types.ts`](https://unpkg.com/@tanstack/offline-transactions@1.0.56/src/types.ts)):
`id`, `mutationFnName`, `mutations`, `keys`, `idempotencyKey`, `createdAt`, retry
state, and an optional transaction-level `metadata`. Each serialized mutation is
`globalKey`, `type`, `modified`, `original`, `changes` and `collectionId`. That
is a row patch, and the mutation's own `metadata` is not in it.
[`TransactionSerializer.ts`](https://unpkg.com/@tanstack/offline-transactions@1.0.56/src/outbox/TransactionSerializer.ts)
leaves it out on the way in and sets `metadata: undefined` on the way out. The
same is true on `main` (1.0.58).

SIMMER's write path carries the domain command in that field.
`packages/sync/src/collections/functions/mutate-collection.ts` puts
`intents`, `acknowledgements`, `arguments` and the rest on the mutation's `metadata`, and
`command-request.ts` builds the request from it, starting with
`requireIntents(mutation.metadata, table)`. A mutation replayed from the outbox
after a restart has none of it. A mutation sent in the same session, before any
restart, still has its in-memory `metadata`, so the gap shows only after the app
is killed with writes queued.

What does survive is the transaction-level `metadata`, which
`createOfflineTransaction({ mutationFnName, metadata })` takes and the serializer
writes. `createOfflineAction` takes no `metadata`. So the package can hold a
queue of domain commands only if the command is written into transaction-level
`metadata` (or into the row fields) rather than into each mutation's.

## Sources

- npm registry metadata, read 2026-10-01:
  [`@tanstack/db`](https://registry.npmjs.org/@tanstack/db),
  [`@tanstack/db-sqlite-persistence-core`](https://registry.npmjs.org/@tanstack/db-sqlite-persistence-core),
  [`@tanstack/expo-db-sqlite-persistence`](https://registry.npmjs.org/@tanstack/expo-db-sqlite-persistence),
  [`@tanstack/react-native-db-sqlite-persistence`](https://registry.npmjs.org/@tanstack/react-native-db-sqlite-persistence),
  [`@tanstack/offline-transactions`](https://registry.npmjs.org/@tanstack/offline-transactions),
  [`@tanstack/electric-db-collection`](https://registry.npmjs.org/@tanstack/electric-db-collection).
- Published source at the 0.9.2-matching versions:
  [`db-sqlite-persistence-core@0.2.23`](https://unpkg.com/browse/@tanstack/db-sqlite-persistence-core@0.2.23/src/),
  [`expo-db-sqlite-persistence@0.2.23`](https://unpkg.com/browse/@tanstack/expo-db-sqlite-persistence@0.2.23/src/),
  [`offline-transactions@1.0.56`](https://unpkg.com/browse/@tanstack/offline-transactions@1.0.56/src/),
  [`electric-db-collection@0.4.10`](https://unpkg.com/browse/@tanstack/electric-db-collection@0.4.10/src/).
- TanStack DB guides on `main`:
  [SQLite persistence](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md),
  [Offline transactions](https://github.com/TanStack/db/blob/main/docs/guides/offline-transactions.md),
  [`@tanstack/db` changelog](https://github.com/TanStack/db/blob/main/packages/db/CHANGELOG.md).
- [TanStack/db#1888](https://github.com/TanStack/db/issues/1888) and
  [TanStack/db#1906](https://github.com/TanStack/db/pull/1906), Expo SQLite 57
  support.
- Expo: [SDK 57 SQLite docs](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/),
  [SDK 57 `bundledNativeModules.json`](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json).
- In this repo: `pnpm-lock.yaml`, `docs/sync.md` (mobile matrix and notes),
  `docs/domain-command-contract.md` ("Offline and sync"),
  `docs/research/full-history-clone-cost.md`,
  `packages/sync/src/collections/functions/command-request.ts` and
  `mutate-collection.ts`.
