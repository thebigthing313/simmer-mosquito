# What a full-history clone of prod into staging costs

Research for issue [#371](https://github.com/thebigthing313/simmer-mosquito/issues/371).
Nothing here is built. No clone was run and nothing was written to any database:
every number below is either read out of `scripts/`, read out of Postgres and
Railway with read-only queries on 2026-08-31, or named as an estimate.

## The answer

Full history is safe, and the clone gets **faster**, not slower.

The clone already dumps and restores prod whole. `-AllHistory` does not add a
byte to either step; it removes the prune that runs after them. Electric already
runs against the full-history database in production, where its slot is 56 bytes
behind and its shape cache is 785 MB of a 5000 MB volume.

Not one of the twenty-four eager web shapes holds a dated record. The prune's
thirteen roots and their cascade closure are on-demand in `docs/sync.md`, every
one of them, so the eager baseline is byte-identical at three years and at
fifteen. The widest eager shape is `traps` at 417 rows.

Three things change and each is worth writing down:

- Staging's Postgres volume goes from 1603 MB to roughly 2100 MB of 5000 MB.
- `-AllHistory` skips the only `ANALYZE` in the pipeline, because the prune
  carried it.
- Staging has `max_slot_wal_keep_size = 2048MB` where prod has `-1`, and a
  full-volume restore generates WAL on the order of 1 GB. That is the one limit
  the pruned copy sat further under. It only bites if Electric is not consuming.

## What was measured

Read-only, against the Railway `staging` and `production` Postgres services and
the Railway metrics API, on 2026-08-31.

| | prod | staging (3-year prune) |
| --- | --- | --- |
| `pg_database_size` | 692 MB | 384 MB |
| `public` schema, total relation size | 677 MB | 177 MB |
| heap only | 415 MB | 107 MB |
| ordinary tables in `public` | 59 | 59 |
| rows in `public`, exact | 1,539,098 | 364,465 |
| `postgis` volume in use | 986 MB of 5000 | 1603 MB of 5000 |
| `electric` volume in use | 785 MB of 5000 | 241 MB of 5000 |
| Electric slot | `active`, 56 bytes behind | `active`, 232 bytes behind |
| tables in `electric_publication_default` | 49 | 51 |
| `max_slot_wal_keep_size` | `-1` | `2048MB` |

Staging's Postgres volume being larger than prod's while holding a third of the
data is #236's residue: about 500 MB of `pg_attribute`, `pg_depend`,
`pg_trigger` and `pg_class` at their high-water mark, which only `VACUUM FULL`
reclaims. It is not a full-history cost and a clone does not change it either
way.

The five biggest tables at full history, with the row payload
(`sum(pg_column_size(t.*))`) each would put on the wire:

| table | rows | payload | total relation size |
| --- | --- | --- | --- |
| `inspections` | 517,348 | 148 MB | 216 MB |
| `applications` | 245,217 | 76 MB | 117 MB |
| `application_batches` | 241,743 | 26 MB | 78 MB |
| `search_documents` | 141,422 | not synced | 100 MB |
| `collection_species` | 98,618 | 14 MB | 24 MB |
| `comments` | 81,527 | 17 MB | 29 MB |

Oldest dated rows: `inspections` and `applications` both start 2011-03-28,
`service_requests` 1990-01-29, `collections` 1826-03-16. The last three years
are 106,774 of 517,348 inspections and 55,411 of 245,218 applications, so the
prune removes roughly 79% of both.

## The clone itself

### The dump and the restore are already at full volume

`scripts/clone-prod-to-staging.ps1` runs, in order: count prod, `pg_dump` prod
whole, `DROP SCHEMA IF EXISTS public CASCADE` plus `CREATE SCHEMA public` on
staging, `pg_restore` the whole dump, compare counts, then prune. The prune is
last and it runs on the target. The script's own header says so ("The dump is
still whole, prod is only ever read, and the trim happens on the target
afterwards"), and `prune-staging-history.sql` repeats it.

So the two steps #371 asks about, `DROP SCHEMA public CASCADE` and `pg_restore`
at full volume, are what happens today on every default run. `-AllHistory`
changes neither. What it removes is the prune: 1.17 million deletes across
eighteen tables in the cascade closure, the transient index builds those deletes
need, the polymorphic orphan sweep, and eleven `vacuum (full, analyze)` table
rewrites. `docs/deployment.md` puts the delete half at "under 30 seconds" with
the transient indexes in place.

Measured against prod on the public proxy, for the parts that are read-only:

- the per-table exact count query, which the clone runs once on each side:
  1.01 s on prod at 1.54 M rows, 1.21 s on staging at 364 k. Row volume is not
  what drives it.
- wire throughput: `\copy` of six `inspections` columns, 517,348 rows and
  92.4 MB of CSV, in 1.27 s. About 72 MB/s.
- the whole-shape snapshot scan Electric would issue for `inspections`:
  `Seq Scan`, 517,348 rows, 122 ms. `applications` 55 ms, `comments` 20 ms.

I did not run `pg_dump` or `pg_restore`, so the end-to-end duration is an
estimate. The dump reads 415 MB of heap and compresses it, at a link that
carries 72 MB/s, which is well under a minute. The restore is the dominant leg:
1.54 M rows loaded and 262 MB of index rebuilt on an instance with
`maintenance_work_mem` at 64 MB and `shared_buffers` at 128 MB. Call it several
minutes and expect the index builds to be most of it. Whatever that number is,
it is the number today, because today's run restores the same dump.

### The prune drops out cleanly

Three guards, and all three key off the same switch:

- `if (-not $AllHistory -and $YearsOfHistory -lt 1) { throw ... }` never fires,
  so the default `3` is not validated and never used.
- `if (-not $AllHistory -and -not (Test-Path $pruneSqlPath)) { throw ... }`, so
  the SQL file is not even required to exist.
- the prune block is `if (-not $AllHistory) { ... } else { Write-Host '==>
  -AllHistory set; staging keeps every dated record prod has.' }`.

`$cutoff` is computed inside the first branch, so it is never evaluated.
`prune-staging-history.sql` is never handed to `psql`, which means section 0's
transient-index `DO` block, the deletes, the polymorphic sweep, the preservation
check, the `tmp_prune_*` cleanup and the eleven `vacuum (full, analyze)` calls
all never run. There is no partial path: the file is a unit and it is either
executed or not.

The row-count check is unaffected. It runs after the restore and before the
prune either way, so under `-AllHistory` it is simply the last thing that
touches the data, and it compares full history against full history.

### One thing the prune was carrying: ANALYZE

`vacuum (full, analyze)` on eleven tables at the end of the prune is the only
`ANALYZE` anywhere in the clone. `pg_restore` does not run one. The PostgreSQL
17 manual's notes for `pg_restore` say it outright: "Once restored, it is wise
to run `ANALYZE` on each restored table so the optimizer has useful statistics."

So `-AllHistory` leaves staging with no planner statistics until autovacuum's
autoanalyze catches up. A bulk load of 517 k rows into a fresh table clears the
autoanalyze threshold immediately, so this resolves itself within an
`autovacuum_naptime`, and the window is a minute rather than a problem. It is
still a behaviour the flag silently drops, and if anyone wants it deterministic
the fix is one `vacuum (analyze)` in the `else` branch.

### Nothing else in the script assumes the pruned size

- `$PublicTableRowCountSql` runs `count(*)` per table through `query_to_xml`.
  Measured above at 1.01 s on full history.
- No statement timeout is set on either side outside the prune file, and
  staging's server `statement_timeout` is `0`.
- The WorkOS relink touches `organizations`, `users` and `memberships`, three
  tables holding 2, a handful, and 5 rows. History does not reach them.
- Triggers are not a restore-time cost. `pg_dump` emits triggers in the
  post-data section, after all `COPY` data, so the 517 k inspection rows do not
  fire `inspections_search_document_write` on the way in and `search_documents`
  arrives from the dump rather than being rebuilt.

Two pieces of prose go stale rather than break. The header of
`clone-prod-to-staging.ps1` and `docs/deployment.md` both describe three years
as what staging keeps, and `prune-staging-history.sql` opens with "Run against
STAGING only". If the prune becomes local-only, that file is misnamed and
`scripts/clone-prod-db.ps1` has to grow the switch: it takes `-ProdUrl`,
`-LocalDb` and `-ResetElectric` today, and has no history parameter and no call
to the prune at all.

## Electric

### The failure mode in #236 is not reachable here

#236 killed the slot with `invalid memory alloc request size 1186513248`: 28
migrations sent as one multi-statement simple query, one implicit transaction,
326 relations, a reorder buffer over Postgres's 1 GB `MaxAllocSize`.

`pg_restore` does not do that. The PostgreSQL 17 manual describes
`--single-transaction` as the option that wraps the emitted commands in
`BEGIN`/`COMMIT`, and the clone does not pass it, so the restore is one
transaction per command. The largest single transaction is therefore one table's
`COPY`, and the largest of those is `inspections`: 517,348 rows, 148 MB of row
payload. That is an eighth of what #236 allocated, and `logical_decoding_work_mem`
is 64 MB on both databases, so a transaction past that spills to disk instead of
allocating.

The `DROP SCHEMA public CASCADE` half drops 326 relations in one transaction,
which is the same relation count. It is a catalog delete rather than 1 GB of
buffered change, and it is what the default clone does today.

### Production is the existence proof

Production Electric is running against the full-history database right now.
`electric_publication_default` on prod holds 49 tables, `inspections` and
`applications` among them, `electric_slot_default` is `active` with
`restart_lsn` 56 bytes behind `pg_current_wal_lsn()`, and over the last seven
days the service averaged 2% CPU and 0.42 GB of memory. Its shape cache sits at
785 MB, peak 785 MB, of a 5000 MB volume.

That is the re-snapshot cost at full history, measured, on a live app: 785 MB of
shape storage against 677 MB of source data. Staging's is 241 MB against 177 MB.
The ratio holds, which is what you would expect from a cache of the same rows.

### No eager shape moves

`docs/sync.md` lists twenty-four eager web tables. Counted on prod at full
history:

`traps` 417, `profiles` 130, `routes` 112, `species` 68, `insecticides` 43,
`habitat_types` 37, `units` 25, `tags` 11, `vehicles` 7, `collection_methods` 6,
`application_methods` 5, `memberships` 5, `region_folders` 4,
`source_reduction_methods` 3, `formulation_insecticides` 3, `organizations` 2,
`outreach_methods` 2, `formulations` 2, `biocontrol_methods` 1,
`notification_types` 1, `collection_lures` 1, `equipment` 0,
`organization_species` 0, `weather_sources` 0.

884 rows in total, and 184 kB is the largest heap among them. Intersect that
list with what `prune-staging-history.sql` deletes from, which is thirteen dated
roots plus the five-table cascade closure plus five polymorphic children, and
the intersection is empty. Every table history touches is on-demand in the web
matrix. The eager baseline is the same object at three years and at fifteen, and
no eager shape crosses any limit because none of them changes size.

### On-demand shapes do not snapshot the table

Electric's shapes guide describes on-demand loading as `changes_only` mode: skip
the initial snapshot, then request subsets through `requestSnapshot()` with
`where`, `orderBy` and `limit`/`offset`. That is the mode
`packages/sync/src/collections/functions/sync-collection.ts` passes through as
`syncMode`, and `apps/server/src/sync-shapes.ts` serves with a `POST` on each
shape path whose body is sanitized to subset-only keys and can only narrow
inside the forced org-scoped `where`.

So `inspections` at 517 k rows is never snapshotted whole. What a surface pulls
is what its live query asks for, and the explorers ask with date bounds. The
full-history cost of an on-demand table is paid one subset at a time, by
whoever asks for a window that old.

The scan behind the widest possible such request is cheap anyway: the whole
`inspections` org shape is a 122 ms sequential scan. Electric's guide gives no
documented maximum shape size and says throughput is about 5,000 row changes per
second, which bears on live change volume rather than on a snapshot.

### The one limit the pruned copy sat further under

Staging runs `max_slot_wal_keep_size = 2048MB`. Prod runs `-1`. #236 recorded
`-1` on staging, so the bound was added since, and it is the right fix: it turns
a stalled slot into an invalidated slot instead of a full volume.

It also means the restore's WAL now has a ceiling. Loading 415 MB of heap and
building 262 MB of index generates WAL on the order of 1 GB, against 2048 MB of
headroom. Pruned, the same restore is the same size, because the restore is
already full-volume; what differs is only that this margin is now something to
know about rather than something to ignore.

It is only a risk if the slot stops advancing, which means only if Electric is
not consuming. The script's header already says Electric does not need to be
stopped. This is the reason it must not be: with Electric running,
`restart_lsn` tracks the restore and nothing accumulates. Staging's slot is 232
bytes behind right now, and it has been through this restore.

One detail helps here. `DROP SCHEMA public CASCADE` drops every table, and
dropping a table removes its `pg_publication_rel` entry, so the publication
survives the reset empty. `docs/deployment.md` already records the benign
`publication ... already exists` restore error, which is the publication object
surviving. Whatever the restore then re-adds, the `COPY` traffic itself is
decoded against a publication holding little or nothing.

## Verdict

Full history does not invalidate the settled design. Run the clone with
`-AllHistory`.

The clone gets shorter by the prune. Staging's Postgres volume lands near
2100 MB of 5000 and its Electric volume near prod's 785 MB of 5000. The eager
baseline does not move at all, and the on-demand tables are paid for a subset at
a time by the screen that asks.

Three follow-ups, none of them blocking:

1. Add a `vacuum (analyze)` to the `-AllHistory` branch, or accept the
   sub-minute autoanalyze window.
2. Give `scripts/clone-prod-db.ps1` the `-YearsOfHistory`/`-AllHistory`
   parameters and a call to the prune, and rename
   `prune-staging-history.sql` to match what it is for.
3. Update the "last 3 years" prose in `clone-prod-to-staging.ps1` and
   `docs/deployment.md`.

## Sources

Repo, at `38ecac74`:
`scripts/clone-prod-to-staging.ps1`, `scripts/prune-staging-history.sql`,
`scripts/clone-prod-db.ps1`, `scripts/lib/table-row-counts.ps1`,
`apps/server/src/sync-shapes.ts`,
`packages/sync/src/collections/functions/sync-collection.ts`,
`packages/db/src/domains/search.ts`,
`packages/db/migrations/202608260001_search_documents.sql`,
`docs/sync.md`, `docs/deployment.md`.

Issues: [#166](https://github.com/thebigthing313/simmer-mosquito/issues/166),
[#236](https://github.com/thebigthing313/simmer-mosquito/issues/236),
[#310](https://github.com/thebigthing313/simmer-mosquito/issues/310),
[#347](https://github.com/thebigthing313/simmer-mosquito/issues/347).

PostgreSQL 17 manual:
[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) for the
`ANALYZE` note and `--single-transaction`.

ElectricSQL docs:
[shapes guide](https://electric.ax/docs/guides/shapes) for `changes_only` and
`requestSnapshot()`,
[deployment guide](https://electric.ax/docs/guides/deployment) for the
filesystem shape cache and the rule that its disk state must stay in sync with
the Postgres slot and publication.

Live reads on 2026-08-31: `pg_database_size`, `pg_total_relation_size`,
`pg_column_size`, `pg_replication_slots`, `pg_publication_rel`, `pg_settings`,
and `explain (analyze, buffers)` on the shape scans, against the prod and
staging public proxies. Railway metrics API for `DISK_USAGE_GB`,
`MEMORY_USAGE_GB` and `CPU_USAGE` over 168 hours, and the volume instances for
`currentSizeMB` and `sizeMB`.
