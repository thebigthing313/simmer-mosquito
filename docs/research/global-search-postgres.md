# Postgres options for mixed identifier and prose search

Answers [#252](https://github.com/thebigthing313/simmer-mosquito/issues/252), a
child of the global search map [#250](https://github.com/thebigthing313/simmer-mosquito/issues/250).

Sources are the PostgreSQL 17 manual, the `pg_trgm` appendix, and the
`postgis/postgis` image build files. No database was queried. Every claim that
needs a plan or a timing to settle is called out in "What has to be measured".

## Recommendation

Build one central corpus table, `search_documents`, maintained by a trigger on
each source table, and index it three ways:

```sql
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

create table search_documents (
  organization_id uuid not null references organizations (id),
  entity_type     text not null,
  entity_id       uuid not null,
  identifier      text not null,
  body            text not null default '',
  document        tsvector generated always as (
                    setweight(to_tsvector('simple',  identifier), 'A') ||
                    setweight(to_tsvector('english', body),       'B')
                  ) stored,
  primary key (entity_type, entity_id)
);

create index search_documents_fts_idx
  on search_documents using gin (organization_id, document);

create index search_documents_identifier_trgm_idx
  on search_documents using gin (organization_id, identifier gin_trgm_ops);

create index search_documents_identifier_prefix_idx
  on search_documents (organization_id, lower(identifier) text_pattern_ops);
```

A soft delete on a source row deletes the `search_documents` row rather than
stamping it, so the corpus holds live rows only and no index carries a
`deleted_at` predicate.

The tradeoff is real and it is write amplification with a correctness risk
attached. Every insert, update and soft delete on roughly 30 tables now writes a
second row in a second table, through a trigger that has to be right 30 times.
Nothing in Postgres will tell you when a trigger drifts from the columns it
reads; the corpus just goes quietly stale, which is the same failure mode #250
already names for a client-side search. What buys that risk is the one thing the
palette cannot get any other way: a merged top 10 whose scores were produced by a
single expression over a single table, from a single `ORDER BY ... LIMIT 10`
instead of a 30-branch `UNION ALL`.

If #250 later drops the merged ranking and shows results grouped by record type,
this recommendation collapses. Per-table stored `tsvector` columns become the
cheaper answer, and section "Where the tsvector lives" below is the one to
re-read.

## The corpus is not 50 tables

The ticket says roughly 50 multi-tenant tables. `packages/db/src/tables.ts`
declares 50 `*Table` interfaces, but only about 30 of them carry a text column a
person would ever type. Several central surfaces carry none at all:
`inspections`, `applications`, `source_reductions`, `biocontrol_actions` and
`collections` have no name, no code and no prose. `collections` in particular is
identified by its trap and its date, not by a string.

There is no `packages/db/schema.sql` in the tree. It is dbmate's generated dump
and it is not committed, so the DDL of record is the 28 files in
`packages/db/migrations/`. The ticket's premise still holds: `grep` over those 28
files finds zero occurrences of `tsvector`, `tsquery`, `to_tsvector`, `pg_trgm`,
`gin` or `btree_gin`. The only `gist` indexes are the 14 PostGIS geometry indexes
in `202605270001_owned_geometry_columns.sql`.

Identifiers, the columns a person types to find one record:

| Table | Identifier columns |
| --- | --- |
| `habitats` | `habitat_name` |
| `traps` | `trap_name`, `trap_code` |
| `addresses` | `display_name`, `address_line_1`, `address_line_2`, `locality`, `postal_code` |
| `contacts` | `contact_name`, `email`, `company`, `department`, `title` |
| `profiles` | `display_name` |
| `regions`, `region_folders` | `name` |
| `samples` | `display_name` |
| `tags` | `tag_name` |
| `routes`, `assignments`, `missions` | `route_name`, `assignment_name`, `mission_name` |
| `equipment`, `vehicles`, `insecticides`, `insecticide_batches`, `formulations`, `application_methods`, `units`, `notification_types`, `weather_sources` | the catalog name plus `serial_number` and `registration_number` |
| `species`, `genera`, `organization_species` | `display_name`, `common_name`, `epithet`, `name`, `abbreviation` |

Prose, the columns worth a full-text index:

| Table | Prose columns |
| --- | --- |
| `comments` | `comment_text` |
| `service_requests` | `details` |
| `habitats`, `traps`, `regions`, `region_folders`, `tags`, `formulations`, `notification_types`, `organization_species` | `description` |
| `outreach_actions` | `reach_description` |
| `requested_control_actions` | `summary` |
| `samples` | `unidentifiable_reason` |
| `assignments`, `missions` | `cancellation_reason` |
| `assignment_items`, `mission_items` | `skip_reason` |

Two facts here change the shape of the answer.

The first is `comments`. It is polymorphic on `entity_type` and `entity_id`, it
carries `organization_id` directly, and `comment_text` is `not null`. Most of the
prose in this product already lives in one table. A full-text index on
`comments` alone covers more free text than the other thirteen prose columns
combined.

The second is `service_requests.display_name`. The ticket calls out "service
request number" as an identifier, and it is one, but it is
`ColumnType<number | null, ...>`, an integer. Text search will not see it and
does not need to. A request number is an exact-equality lookup on a `bigint`,
answered by a plain btree, and the palette should route a purely numeric query
there before it builds a `tsquery` at all.

Tenancy is already flat. 45 of the 50 tables carry `organization_id` directly,
per ADR 0008 and `202605260002_tenant_scope_child_rows.sql`. The 5 that do not
are `users`, `organizations`, `genera`, `species` and `units`, which are the
tenancy roots and the global catalogs. So a search index never has to join to
find its tenant. 44 of the 50 carry `deleted_at`.

## tsvector versus pg_trgm, and what half an identifier does

They fail in opposite directions, and the split is not "identifier versus prose".
It is "whole token versus fragment".

`tsvector` indexes lexemes. The GIN opclass is not lossy: "As inverted indexes,
they contain an index entry for each word (lexeme), with a compressed list of
matching locations", and "GIN indexes are the preferred text search index type"
(12.9). A match is a lookup of one lexeme in that inverted list, so the cost is
proportional to how many rows contain the word, not to how many rows exist.
Against `comments.comment_text` and `service_requests.details` this is the right
structure and nothing else comes close.

`pg_trgm` indexes three-character windows. "A trigram is a group of three
consecutive characters taken from a string", and each word is padded with "two
spaces prefixed and one space suffixed", so `cat` yields `" c"`, `" ca"`, `"cat"`
and `"at "` (F.33.1). A GIN or GiST trigram index supports `similarity` searches
and also "trigram-based index searches for `LIKE`, `ILIKE`, `~`, `~*` and `=`
queries" (F.33.4), which is what makes an unanchored `%foo%` indexable at all.

Now the case the ticket asks about. Someone types `ond` and means the habitat
`Cedar Pond`.

`tsvector` cannot answer it. `to_tsquery('ond:*')` matches lexemes that *begin*
with `ond`; it does not match `pond`. Prefix matching is a prefix of a lexeme,
never a substring of one. There is no infix operator on `tsvector`. Someone who
types the tail of a trap code, or who starts typing at the second word of a
multi-word name without a word boundary, gets nothing back and no signal that
the index simply cannot see it.

`pg_trgm` answers it. `identifier ilike '%ond%'` extracts the trigrams `ond` and
resolves against the trigram GIN index. So does `identifier % 'ond'` under the
similarity threshold, though `%` compares the whole strings and a three-character
query against a ten-character name scores low; `pg_trgm.similarity_threshold`
defaults to 0.3 (F.33.3), and `word_similarity` / `<%` exist precisely because
"this function returns a value that can be approximately understood as the
greatest similarity between the first string and any substring of the second
string" (F.33.2). For the palette, `ilike '%q%'` against the trigram index is the
predictable operator and `word_similarity` is the ranking signal, not the filter.

The trigram failure mode is short input: "a pattern with no extractable trigrams
will degenerate to a full-index scan" (F.33.4). One and two character queries
have no trigrams. The palette has to hold its first two keystrokes rather than
send them.

The other thing `tsvector` does to identifiers is mangle them. The `english`
configuration runs a Snowball stemmer and a stop-word list, so a habitat called
`The Pond` indexes as `pond` and a trap named `Site A` loses nothing but is
stemmed anyway. The `simple` dictionary "operates by converting the input token
to lower case and checking it against a file of stop words" (12.6.2) and its stop
word list is the one you choose. Identifiers belong in a `simple` vector; prose
belongs in an `english` one. That is why the recommendation concatenates two
`setweight` calls with different configurations rather than one `to_tsvector`
over both columns.

## Prefix matching and its limits

`to_tsquery` supports `:*`, and "such a lexeme will match any word in a
`tsvector` that begins with the given string" (12.3.2). Four limits matter.

It is lexeme-prefix only. Covered above: `ond:*` does not find `Pond`.

Only `to_tsquery` and a literal `tsquery` accept it. The docs state for each of
the other three constructors that it "will not recognize `tsquery` operators,
weight labels, or prefix-match labels in its input" (12.3.2). That includes
`websearch_to_tsquery`, which is otherwise the obvious choice because it "never
raises syntax errors".

`to_tsquery` does raise syntax errors. "Without quotes, `to_tsquery` will
generate a syntax error for tokens that are not separated by an AND, OR, or
FOLLOWED BY operator" (12.3.2). A palette that pipes raw keystrokes into
`to_tsquery` will 500 the first time someone types an apostrophe or an ampersand.
The endpoint has to tokenize the input itself, drop non-word characters, and
assemble `tok1:* & tok2:*`, or call `plainto_tsquery` and append `:*` to the last
lexeme by rewriting the `tsquery`.

Its cost is not stated. A GIN prefix search has to visit every distinct lexeme
sharing the prefix. The manual gives no cost warning for `:*` the way F.33.4 does
for trigrams, so how a one or two character prefix behaves over this corpus is a
measurement, not a citation.

For the anchored case, `identifier ilike 'ced%'`, a trigram index is not the
cheapest tool. A btree on `lower(identifier) text_pattern_ops` is. The pattern
opclasses compare "strictly character by character rather than according to the
locale-specific collation rules", which "makes these operator classes suitable
for use by queries involving pattern matching expressions" under a non-C locale
(11.10). Anchored prefix is the single most common thing a person does in a
palette, so it earns its own index.

## Where the tsvector lives

Three shapes, and their write cost across the corpus.

**Expression index**, `create index ... using gin (to_tsvector('english', body))`.
Cheapest on disk, "since the `tsvector` representation is not stored explicitly"
(12.2.2). Two catches. The query must repeat the expression verbatim, including
the configuration name: "`WHERE to_tsvector('english', body) @@ 'a & b'` can use
the index, but `WHERE to_tsvector(body) @@ 'a & b'` cannot". And every index
match is re-verified by recomputing `to_tsvector`, so ranking and recheck pay the
parse cost again.

**Stored generated column.** "Searches will be faster, since it will not be
necessary to redo the `to_tsvector` calls to verify index matches" (12.2.2). PG
17 implements stored generated columns only, they are "computed when it is
written (inserted or updated)", and the expression "can only use immutable
functions", which is why the two-argument `to_tsvector(regconfig, text)` is
required. The write cost across 30 tables is where this hurts:

- Every `UPDATE` on a covered row recomputes the vector. The manual says the
  column is computed when the row is written; it does not carve out an update
  that leaves the base columns alone. Assume the parse happens on every update
  until measured.
- Every such update also touches the GIN index, which means the update cannot be
  HOT. "Insertion into a GIN index can be slow due to the likelihood of many keys
  being inserted for each item" (64.4.5). `fastupdate` defers the work into a
  pending list, at the price that "searches must scan the list of pending entries
  in addition to searching the regular index, and so a large list of pending
  entries will slow searches significantly" (64.4.4.1).
- 30 GIN indexes means 30 pending lists and 30 `gin_pending_list_limit` knobs.

There is a fourth cost specific to this repo. `habitats`, `traps`, `regions`,
`tags`, `service_requests` and most of the corpus are synced tables. Adding a
`tsvector` column to any of them changes the row shape Electric replicates and
the row shape `packages/sync` generates, and
`packages/sync/src/tests/unit/collections/tables/drift.test.ts` will fail until
the column is added to the withheld list in `scripts/withheld-columns.mjs`. A
`tsvector` is not small. Streaming one to every browser to support a search that
runs on the server is pure waste, so each of the 30 columns needs a withhold
entry, and a missed entry ships the column.

**Central table.** One `tsvector` column, one GIN index, one pending list, and
nothing added to any synced row shape. `search_documents` gets no collection
module, which puts it in the same class as `users`, `genera` and the region
intersection cache, all already listed in `docs/sync.md` as unsynced.

Its cost is the trigger fan-out. A write to `habitats` becomes a write to
`habitats` plus an upsert into `search_documents`: a second row version, a second
set of index entries, inside the same transaction. That is not obviously cheaper
than a stored column on `habitats` in raw work. It is cheaper in the number of
GIN indexes, and it is the only shape that makes a merged rank possible, which is
the next section.

## Keeping organization_id index-usable

`organization_id = $1 and document @@ $2` has three plans available.

**Multicolumn GIN with btree_gin.** GIN has no opclass for `uuid` on its own, so
the tenant column needs `btree_gin`, which provides GIN operator classes for a
list of scalar types including `uuid`. Its own documentation names this exact
case: "for queries that test both a GIN-indexable column and a B-tree-indexable
column, it might be more efficient to create a multicolumn GIN index that uses
one of these operator classes than to create two separate indexes that would have
to be combined via bitmap ANDing."

Column order does not matter here, which is worth stating because it contradicts
btree instinct. "A multicolumn GIN index can be used with query conditions that
involve any subset of the index's columns. Unlike B-tree or GiST, index search
effectiveness is the same regardless of which index column(s) the query
conditions use" (11.3).

**Two indexes, bitmap AND.** The planner "scans each needed index and prepares a
bitmap in memory", then ANDs them (11.5). It works, and it costs: "any ordering
of the original indexes is lost", and "each additional index scan adds extra
time". Against a large agency this means materializing a bitmap over every row in
that agency before intersecting with the text match, which is the opposite of
what a top-10 query wants.

**Partial index per organization.** Ruled out. The index count grows with the
customer list, and each one needs a migration.

Take the multicolumn GIN. The trigram index takes the same shape,
`gin (organization_id, identifier gin_trgm_ops)`. The prefix btree is ordinary,
`(organization_id, lower(identifier) text_pattern_ops)`, with the tenant column
leading because 11.3's leading-column rule does apply to btree.

One caveat the palette has to respect: `organization_id` arrives as a bind
parameter, and that is fine for an equality condition against an index column. It
is only *partial index predicates* that parameters cannot satisfy, which is the
next section.

## Ranking, and whether scores compare

They do not compare, and the manual says why.

"It is important to note that the ranking functions do not use any global
information, so it is impossible to produce a fair normalization to 1% or 100% as
sometimes desired. Normalization option 32 (`rank/(rank+1)`) can be applied to
scale all ranks into the range zero to one, but of course this is just a cosmetic
change; it will not affect the ordering of the search results" (12.3.3).

`ts_rank` "ranks vectors based on the frequency of their matching lexemes".
`ts_rank_cd` computes cover density and "requires lexeme positional information",
returning zero if the vector was stripped (12.3.3). Both are functions of one
document and one query. Neither knows how rare the matched word is across the
corpus, so there is no IDF and no cross-document calibration. A one-word habitat
name and a 200-word comment matching the same term produce numbers whose
difference is document length, not relevance. The normalization bitmask lets you
divide by document length (option 2) or its logarithm (option 1), which reduces
the distortion and does not remove it.

`similarity()` is different in kind. It returns a genuine ratio, "zero
(indicating that the two strings are completely dissimilar) to one (indicating
that the two strings are identical)" (F.33.2). It is bounded and it is
interpretable. It is also measuring a different thing than `ts_rank`, so putting
the two on one scale is arithmetic without meaning.

So: ranks from different tables are not comparable, and ranks from a `tsvector`
match and a trigram match are not comparable even within one table. Two
consequences for #250's single merged top 10.

Rank by match class first, score second. The class is discrete and defensible:

1. exact identifier match, case-folded
2. anchored identifier prefix
3. identifier trigram match above threshold, ordered by `word_similarity`
4. full-text match on the prose vector, ordered by `ts_rank_cd`

A habitat whose name is exactly what the person typed outranks a comment that
mentions the word, and no float has to justify it. Within a class the score is
comparable enough because it is one function over one column.

Ranking is not free. "Ranking can be expensive since it requires consulting the
`tsvector` of each matching document, which can be I/O bound and therefore slow"
(12.3.3). Rank the candidate set, not the match set: take a bounded number of
rows per class, then score. `gin_fuzzy_search_limit` exists for the same reason,
as "a configurable soft upper limit on the number of rows returned", with "values
in the thousands (e.g., 5000-20000)" suggested (64.4.5).

The central table does not make ranks fair. It makes them consistent: one
weighting rule, one configuration pair, one expression. Weights `A` and `B` from
`setweight` give the identifier half a fixed lead over the prose half inside a
single `ts_rank` call, which is the only cross-kind comparison in this design
that Postgres itself computes.

## What the image ships, and what needs a migration

`postgis/postgis:17-3.5` builds `FROM docker.io/postgres:17-bullseye` and installs
`postgresql-17-postgis-3` and its scripts. Its `initdb-postgis.sh` runs, against
`template_postgis` and `$POSTGRES_DB`:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;            -- PostGIS < 3.7
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;   -- PostGIS < 3.7
```

Neither `pg_trgm` nor `btree_gin` is among them. Both are contrib modules that
ship with the server build, so no package install is needed, but both need
`create extension`. This repo's migrations already do exactly that for `pgcrypto`
and `postgis`, in `202605060001_identity_and_organizations.sql`, with no `schema`
clause. A search migration follows the same form.

`fuzzystrmatch` being present is worth one line, because it looks adjacent and is
not. It provides `levenshtein`, `soundex` and `metaphone`, none of which are
indexable the way `pg_trgm` is. It is not a substitute.

The one thing that is not settled by reading: whether Railway's staging Postgres
permits `create extension pg_trgm`. CI runs the `postgis/postgis:17-3.5` container
and will, but staging is Railway's own image and the migration runs as whatever
role Railway grants. That is in "What has to be measured".

## The soft-delete trap, and why it does not bite here

The trap recorded in `docs/deployment.md` is that a foreign-key column indexed
`where deleted_at is null` is invisible to referential integrity: Postgres's RI
check issues its own plan and cannot use a partial index, so sixteen FK columns
"look covered" and are not.

That trap does not reach a search index. RI never consults one. The rule that
governs a partial search index is the ordinary one in 11.8: a partial index is
usable "only if the system can recognize that the `WHERE` condition of the query
mathematically implies the predicate of the index", and short of simple
inequality reasoning "the predicate condition must exactly match part of the
query's `WHERE` condition". `deleted_at is null` is a constant predicate, and the
search query would contain it literally, so the implication is recognized. There
is no parameter involved, which is the case 11.8 warns about.

So a partial `where deleted_at is null` GIN index on a per-table `tsvector` would
work. It would also be the right call, since it keeps deleted rows out of the
index entirely and out of the GIN pending list.

The central table sidesteps the question. `search_documents` holds no
`deleted_at` column. The trigger inserts on create, updates on change, and
deletes the row when the source row is soft-deleted. Every index on it is
unconditional. There is no predicate for the planner to prove and no partial
index for a future reader to misjudge, which is worth something in a repo where
that exact misjudgement is already a documented incident.

One consequence to plan for: the trigger has to fire on the soft delete. A soft
delete in this codebase is an `UPDATE` that stamps `deleted_at`, so an
`after insert or update or delete` trigger sees it as an update and has to branch
on `new.deleted_at is not null`. A `before delete` trigger alone would never run.

## What has to be measured

Reading settles the shapes. It does not settle any of these, and each names the
experiment.

**Whether a stored generated column recomputes on an unrelated update.** The
manual says the column is computed when the row is written and does not address
the case where the base columns are unchanged. Test: a `tsvector` column over a
large `text`, an `UPDATE` that touches only an unrelated column, and
`EXPLAIN (ANALYZE, BUFFERS)` plus timing against the same update on a table
without the column. This decides how bad the per-table shape actually is.

**The cost of a one and two character prefix.** `to_tsquery('simple', 'a:*')`
over the real corpus, `EXPLAIN (ANALYZE)`. If it approaches a full index scan the
palette's minimum query length is 3, matching the trigram floor, and the two
paths agree on when to fire.

**Whether the trigram index or the prefix btree wins for anchored input.** Both
can serve `ilike 'ced%'`. Which the planner picks, and whether keeping both is
worth the second index, is a plan question over real cardinalities.

**Write amplification on the busiest table.** `comments` and `service_requests`
take the most writes. Time an insert and an update with the trigger installed
against the same statements without it, and watch `gin_pending_list_limit`
behaviour under a sustained write.

**Index size.** `pg_relation_size` for the three `search_documents` indexes at
production scale. `docs/deployment.md` records roughly half a million
inspections, two hundred thousand applications and 217k `application_batches`,
but none of those carry text. There is no recorded row count for `habitats`,
`traps`, `addresses`, `contacts`, `service_requests` or `comments`, which are the
tables that would populate the corpus. Getting those counts off production is the
cheapest measurement on this list and should come first.

**Whether Railway staging permits `create extension pg_trgm` and `btree_gin`.**
One query settles it:

```sql
select name, default_version, installed_version
from pg_available_extensions
where name in ('pg_trgm', 'btree_gin');
```

If the role cannot create them, the whole trigram half of this design is gone and
the fallback is prefix-only identifier matching, which changes what the palette
can promise.

**Backfill time.** Populating `search_documents` from 30 tables in one migration
against production. GIN build time "is very sensitive to the
`maintenance_work_mem` setting" (64.4.5), and the manual's advice for bulk load is
to build the index after the rows are in, not before.

## Sources

PostgreSQL 17 manual:

- [11.3. Multicolumn Indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html)
- [11.5. Combining Multiple Indexes](https://www.postgresql.org/docs/17/indexes-bitmap-scans.html)
- [11.8. Partial Indexes](https://www.postgresql.org/docs/17/indexes-partial.html)
- [11.10. Operator Classes and Operator Families](https://www.postgresql.org/docs/17/indexes-opclass.html)
- [12.2. Tables and Indexes](https://www.postgresql.org/docs/17/textsearch-tables.html)
- [12.3. Controlling Text Search](https://www.postgresql.org/docs/17/textsearch-controls.html)
- [12.6. Dictionaries](https://www.postgresql.org/docs/17/textsearch-dictionaries.html)
- [12.9. Preferred Index Types for Text Search](https://www.postgresql.org/docs/17/textsearch-indexes.html)
- [12.11. Limitations](https://www.postgresql.org/docs/17/textsearch-limitations.html)
- [64.4. GIN Indexes](https://www.postgresql.org/docs/17/gin.html)
- [Generated Columns](https://www.postgresql.org/docs/17/ddl-generated-columns.html)
- [btree_gin](https://www.postgresql.org/docs/17/btree-gin.html)
- [F.33. pg_trgm](https://www.postgresql.org/docs/17/pgtrgm.html)

Image:

- [docker-postgis 17-3.5 Dockerfile](https://github.com/postgis/docker-postgis/blob/master/17-3.5/Dockerfile)
- [docker-postgis 17-3.5 initdb-postgis.sh](https://github.com/postgis/docker-postgis/blob/master/17-3.5/initdb-postgis.sh)

Repo:

- `packages/db/migrations/` (28 files, no `schema.sql` is committed)
- `packages/db/src/tables.ts`
- `docs/sync.md`, `docs/deployment.md`, `docs/adr/0008-tenant-scope-columns-on-org-owned-rows.md`
- `packages/sync/src/tests/unit/collections/tables/drift.test.ts`, `scripts/withheld-columns.mjs`

## Limits of this note

`12.11` puts a `tsvector` at under 1 MB and a lexeme at under 2 kB, so nothing in
this corpus is near a text-search limit and the point is not developed above.

Two things #250 lists as unspecified are untouched here because they are not
Postgres questions: whether results respect anything beyond organization and
role, and whether an operator who entered an agency under ADR 0011 reaches
another agency's records. Both change what `organization_id = $1` means and
neither changes the index shape.
