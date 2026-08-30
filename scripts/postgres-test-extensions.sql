-- Runs once, when the compose Postgres initialises an empty data volume.
--
-- The migration set creates four extensions `if not exists`. Against a database
-- that has none of them, the first throwaway `simmer_test_*` schema to get there
-- creates them inside itself, and takes them with it when it is dropped.
-- `pg_extension` is keyed by name across the whole database, so the next
-- schema's `if not exists` finds the name taken and skips, then fails on the
-- first thing the extension owns: `gin_trgm_ops` lives in the first schema and
-- is not on the second one's `search_path`.
--
-- Staging has all four in `public` already, and CI's "Prepare the database" step
-- creates them for the same reason. This gives the local container the same
-- starting point, so the migrations are the no-op they are everywhere else.
-- Every extension any migration creates belongs on this list.
create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists btree_gin;
