# ADR 0004: SQL-first Kysely database layer

Status: Accepted

Date: 2026-05-06

## Context

SIMMER's database will use Postgres features directly, including PostGIS,
constraints, indexes, views, and transaction behavior needed for Electric sync.
The schema should not be hidden behind an ORM-generated migration model.

## Decision

Use SQL migrations as the database source of truth. Use dbmate to apply
migrations. Use Kysely for typed server-side queries and transactions.

Generate `packages/db/src/tables.ts` from the migrated schema. The generator is
`pnpm generate:table-types`, and it reads `packages/db/schema.sql`, the schema
dbmate dumps when `pnpm db:migrate` applies the migrations. `pnpm
check:table-types` runs it and fails on any difference, in CI's `verify` job.

## Amendment, 2026-09-04

This ADR named `kysely-codegen` and nothing ever ran it. The table types were
hand-maintained for four months while the file's own header, this ADR and
`docs/architecture.md` all said they were generated (#425).

The generator that replaced it is a script in this repository rather than
`kysely-codegen`, for two reasons. It takes the dump rather than a connection,
so the gate runs in `verify` with the other static checks and needs no database
and no credentials. And three of the decisions in the file are not in the
catalog: which tables Kysely has no interface for, which columns the
`set_owned_centroid()` trigger owns, and that `SimmerRole` is declared in
`packages/domain` and re-exported. Each is a named declaration in
`scripts/generate-table-types.mjs`.

The dump is the realised schema, not the migration text. Parsing `create table`
blocks misses every `alter table ... add column`, which is how a real bug got
past a check in #123.

## Consequences

- Database evolution is explicit SQL.
- Kysely improves server query safety without owning the schema.
- Raw SQL remains available for PostGIS, CTEs, txid handling, and optimized
  queries.
- `packages/db/schema.sql` is checked in and moves with every migration. A
  migration whose dump nobody refreshed fails the gate, because the generator
  compares the dump's applied versions against the migration files.
- A new table gets an interface and a `SimmerDatabase` entry without anyone
  writing one. A table that should not have either is named in the generator.
