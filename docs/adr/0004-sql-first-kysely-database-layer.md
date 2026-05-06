# ADR 0004: SQL-First Kysely Database Layer

Status: Accepted

Date: 2026-05-06

## Context

SIMMER's database will use Postgres features directly, including PostGIS,
constraints, indexes, views, and transaction behavior needed for Electric sync.
The schema should not be hidden behind an ORM-generated migration model.

## Decision

Use SQL migrations as the database source of truth. Use dbmate to apply
migrations. Use Kysely for typed server-side queries and transactions.

Use `kysely-codegen` to generate table types from the migrated database once the
schema grows beyond the initial hand-written identity slice.

## Consequences

- Database evolution is explicit SQL.
- Kysely improves server query safety without owning the schema.
- Raw SQL remains available for PostGIS, CTEs, txid handling, and optimized
  queries.
- Generated DB types should track the real migrated database.
