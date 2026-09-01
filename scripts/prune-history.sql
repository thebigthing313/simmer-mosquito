-- Trim a freshly cloned database to a recent window of operational history. Run
-- against a CLONE only, after scripts/clone-prod-db.ps1 (local Docker) or
-- scripts/clone-prod-to-staging.ps1 has restored the dump. Never run this
-- against production.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v cutoff=2023-08-07 \
--     -f scripts/prune-history.sql
--
-- Why: prod carries operational records back to 2011 — roughly half a million
-- inspections and two hundred thousand applications. A clone exists to make
-- local dev realistic, and three years of history does that as well as fifteen
-- while leaving a database that syncs, re-snapshots, and restores in a fraction
-- of the time.
--
-- What is NOT pruned: reference data an agency accumulates rather than
-- performs. Habitats, traps, addresses, regions, contacts, routes, taxonomy,
-- methods, products, units, profiles, memberships. Deleting those would change
-- what the app *is*, not how much history it holds, and a habitat is still the
-- habitat it was in 2011. An address whose only service request was pruned is
-- what the next request at that location reuses.
--
-- For `addresses`, `regions` and `contacts` that is this file's own rule, not a
-- property of the schema. Section 1 counts the three inside the transaction and
-- section 5 counts them again before the commit, and any shortfall aborts the
-- whole prune. Say a table is short and the run ends having deleted nothing.
--
-- They did survive without it, which is why the check costs nothing today. The
-- cascade does not reach them, and that is the same walk section 0 makes: the
-- closure of the 13 dated roots is 18 tables, the roots plus
-- application_batches, collection_species, assignment_items, mission_items and
-- mission_notifications, with no reference table in it. Every foreign key
-- between a reference table and a pruned one points the other way and is ON
-- DELETE RESTRICT: 12 into `addresses` (`service_requests.address_id`,
-- `inspections.address_id`, and ten more) and 3 into `contacts`. Deleting a
-- service request deletes the row holding the pointer, so the address and the
-- contact stay. `regions` is referenced by no foreign key at all, because
-- region membership is computed on read (ADR 0015). #307 walked `pg_constraint`
-- for all of that, and re-check it by running section 0's recursive `doomed`
-- query and reading the closure instead of the missing indexes. What none of it
-- gives you is a guarantee: one migration turning a RESTRICT into a CASCADE
-- moves a reference table into the closure, and nothing would say so.
--
-- Do not size an index, a query plan or a backfill off staging even so, and not
-- because rows went missing. Staging is frozen at the date it was cloned while
-- prod keeps growing. Counted 191 ms apart on 2026-08-30, prod held 9,849
-- addresses, 345 regions and 9,475 contacts against staging's 4,599, 183 and
-- 7,935. Restrict prod to rows created before the 2026-08-09 clone and it holds
-- 4,596, 181 and 7,933, which is staging minus the two or three rows written on
-- staging since. Regions settles it: prod created 137 on 2026-07-24, 44 on
-- 2026-08-03 and 164 on 2026-08-11, and staging holds the first two batches and
-- none of the third. #273 read that gap as loss and #265 sized off staging as
-- though it were prod, and both were counting a different day. Record the clone
-- date beside any number you measure here.
--
-- Rows that cannot be dated are KEPT. Every predicate below is `<` against a
-- column that may be null, and `null < date` is null, so an undatable row falls
-- through every delete. That is the safe direction: staging carrying a little
-- extra beats staging silently losing a record whose date column was empty.

\set ON_ERROR_STOP on

-- A statement that outlives its client is worse than a slow one. psql killed by
-- its own timeout leaves the server-side DELETE running, holding row locks,
-- visible only to someone who thinks to read pg_stat_activity — which is how an
-- early version of this file left an 18-minute delete churning on staging after
-- everyone believed it had stopped. A server-side ceiling ends it without
-- anyone having to notice.
set statement_timeout = '30min';

-- ---------------------------------------------------------------------------
-- 0. Indexes the delete cannot run without
-- ---------------------------------------------------------------------------
-- Postgres enforces every foreign key pointing AT a row it deletes by looking
-- up that row's children. With no index the lookup is a sequential scan of the
-- whole child table, once per deleted parent — and this prune deletes hundreds
-- of thousands of parents.
--
-- Two things make the list of missing indexes impossible to write down by hand,
-- and both were got wrong before this became generated:
--
--   * **A partial index does not count.** Nearly every FK column here is
--     indexed `WHERE deleted_at IS NULL`, which serves the app's soft-delete
--     queries perfectly. Referential integrity's lookup carries no such
--     predicate, so the planner cannot use those indexes at all. Sixteen
--     columns are in this state and every one of them *looks* indexed. On
--     `application_batches (application_id)` it cost 11ms per deleted
--     application — 3358ms of a 3362ms delete — and a plain non-partial index
--     took the same work to 3.4ms.
--   * **ON DELETE CASCADE widens the target set.** Deleting an application
--     deletes its batches, so anything referencing `application_batches` is
--     also consulted. The set of tables that lose rows is the cascade closure
--     of the dated roots, not the roots themselves.
--
-- So this introspects rather than enumerates: walk the cascade closure, then
-- index every FK column into it that has no index referential integrity can
-- actually use. A schema change cannot silently fall out of this list.
--
-- Built here and dropped at the end rather than added to the schema: staging is
-- meant to mirror prod, and this file must not be the thing that quietly makes
-- it stop doing so. The gap is real in production too, but whether it matters
-- there is a question about hard-delete write patterns — see issue #126 — not
-- something a clone script gets to decide.

do $indexes$
declare
	fk record;
	index_name text;
	built int := 0;
begin
	for fk in
		with recursive doomed(relid) as (
			-- The dated roots this file deletes from.
			select oid from pg_class
			where relkind = 'r' and relname = any (array[
				'applications', 'biocontrol_actions', 'source_reductions', 'outreach_actions',
				'requested_control_actions', 'collections', 'inspections', 'service_requests',
				'assignments', 'missions', 'weather_summaries', 'samples', 'sample_species'
			])
			union
			-- ...plus everything ON DELETE CASCADE drags down with them.
			select con.conrelid
			from pg_constraint con
			join doomed d on d.relid = con.confrelid
			where con.contype = 'f' and con.confdeltype = 'c'
		)
		select distinct src.relname as child_table, a.attname as child_column
		from pg_constraint con
		join doomed d on d.relid = con.confrelid
		join pg_class src on src.oid = con.conrelid
		-- conkey[1] is the FK's leading column, which is the one an index must
		-- start with to serve the lookup.
		join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
		where con.contype = 'f'
		  and not exists (
			select 1 from pg_index i
			where i.indrelid = con.conrelid
			  and i.indkey[0] = a.attnum
			  and i.indpred is null   -- partial: unusable for referential integrity
			  and i.indisvalid
		  )
	loop
		index_name := left(format('tmp_prune_%s_%s', fk.child_table, fk.child_column), 63);
		execute format(
			'create index if not exists %I on %I (%I)',
			index_name, fk.child_table, fk.child_column
		);
		built := built + 1;
	end loop;
	raise notice 'transient indexes built: %', built;
end $indexes$;

begin;

\echo '--> pruning operational history older than' :'cutoff'

-- ---------------------------------------------------------------------------
-- 1. The reference tables this prune promises to leave alone
-- ---------------------------------------------------------------------------
-- Baseline for the shortfall check in section 5, taken after the transaction
-- opens so the two counts see the same snapshot and nothing but this file's own
-- deletes can come between them. `on commit drop` because the check is the only
-- reader and it runs before the commit.
--
-- Shortfall is the word scripts/lib/table-row-counts.ps1 uses for the same
-- comparison across a clone, and it means the same thing here: only a loss
-- fails. Nothing between the two counts inserts, so a surplus cannot arise, and
-- a table that had grown would say nothing about whether rows were taken.

create temp table prune_reference_row_counts on commit drop as
select 'addresses' as table_name, count(*) as rows_before from addresses
union all select 'regions', count(*) from regions
union all select 'contacts', count(*) from contacts;

-- ---------------------------------------------------------------------------
-- 2. The two RESTRICT edges, which have to go first
-- ---------------------------------------------------------------------------
-- `inspections -> samples` and `samples -> sample_species` are ON DELETE
-- RESTRICT, unlike every other child in this schema. Deleting an old inspection
-- that has samples therefore *fails* rather than cascading, so its samples and
-- their species have to be removed by hand, deepest first. Getting this order
-- wrong is not a silent problem — the transaction aborts — but it is the whole
-- reason this file is a sequence rather than one statement.

delete from sample_species ss
using samples s
join inspections i on i.id = s.inspection_id
where ss.sample_id = s.id
  and i.inspection_date < :'cutoff';

delete from samples s
using inspections i
where s.inspection_id = i.id
  and i.inspection_date < :'cutoff';

-- ---------------------------------------------------------------------------
-- 3. The dated roots
-- ---------------------------------------------------------------------------
-- Everything else that references these is ON DELETE CASCADE (application
-- batches, collection species, assignment and mission items, mission
-- notifications) or ON DELETE SET NULL (the cross-links between actions,
-- requests, inspections, and collections). Both are what we want: a kept record
-- that pointed at a pruned one loses the pointer and stays.

delete from applications where application_date < :'cutoff';
delete from biocontrol_actions where biocontrol_date < :'cutoff';
delete from source_reductions where source_reduction_date < :'cutoff';
delete from outreach_actions where outreach_date < :'cutoff';
delete from requested_control_actions where requested_at < :'cutoff';

-- A collection is dated by `collected_at` OR `collection_date`, whichever the
-- agency's timing mode records — reading one alone is how a surface silently
-- empties. `coalesce` keeps a row datable under either mode, and undatable
-- under neither.
delete from collections
where coalesce(collected_at::date, collection_date) < :'cutoff';

delete from inspections where inspection_date < :'cutoff';
delete from service_requests where request_date < :'cutoff';
delete from assignments where assignment_date < :'cutoff';
delete from missions where scheduled_start_at::date < :'cutoff';
delete from weather_summaries where end_date < :'cutoff';

-- ---------------------------------------------------------------------------
-- 4. Polymorphic children, which no foreign key protects
-- ---------------------------------------------------------------------------
-- `comments`, `additional_personnel`, `tag_items`, `assignment_items`, and
-- `route_items` address their parent as (entity_type, entity_id) with no FK, so
-- nothing above touched them and every one of them is now potentially pointing
-- at a row that no longer exists. An orphan here is worse than clutter: the
-- comment thread on a habitat detail page reads its rows by entity id, so a
-- stale row surfaces as a comment attached to whatever later reuses that id.
--
-- The pairs are read out of the data rather than written down here. A list was
-- tried first and was wrong on its first contact with production: staging
-- carried 16 (child, entity_type) pairs and prod carried four the list had
-- never seen — `comments -> application`, `comments -> source_reduction`,
-- `additional_personnel -> outreach_action`, `-> source_reduction`. A list
-- validated against one database is not validated, and this one is only ever
-- read on a database that was somewhere else an hour ago.
--
-- `entity_type` is stored snake_case singular and its table is the plural,
-- which holds for all 15 pairs prod contains. Deriving the parent that way and
-- refusing to continue when the derived table does not exist keeps the
-- fail-loud property without keeping the list: a new entity_type is handled,
-- and an irregular plural stops the clone instead of silently skipping rows.

do $polymorphic$
declare
	link record;
	parent_table text;
	removed bigint;
begin
	for link in
		select 'comments' as child_table, entity_type from comments where entity_type is not null
		union select 'additional_personnel', entity_type from additional_personnel where entity_type is not null
		union select 'tag_items', entity_type from tag_items where entity_type is not null
		union select 'assignment_items', entity_type from assignment_items where entity_type is not null
		union select 'route_items', entity_type from route_items where entity_type is not null
	loop
		parent_table := link.entity_type || 's';

		if to_regclass('public.' || parent_table) is null then
			raise exception
				'polymorphic entity_type % (on %) does not pluralise to a table: no %',
				link.entity_type, link.child_table, parent_table;
		end if;

		execute format(
			'delete from %I c where c.entity_type = %L
			   and not exists (select 1 from %I p where p.id = c.entity_id)',
			link.child_table, link.entity_type, parent_table
		);
		get diagnostics removed = row_count;
		if removed > 0 then
			raise notice 'orphans removed: % % -> %', removed, link.child_table, link.entity_type;
		end if;
	end loop;
end $polymorphic$;

-- ---------------------------------------------------------------------------
-- 5. The preservation rule, checked before anything is committed
-- ---------------------------------------------------------------------------
-- Re-count section 1's three tables and raise on a shortfall. Raising here
-- rolls the transaction back, so a prune that took reference data ends having
-- deleted nothing, and psql under ON_ERROR_STOP=1 exits non-zero rather than
-- reporting a clone that worked.
--
-- The count is `count(*)`, which includes soft-deleted rows. A row this file
-- must not delete is a row, and whether the app hides it is a separate
-- question; counting live rows only would let a delete pass as a soft delete.

do $preserved$
declare
	baseline record;
	rows_after bigint;
	shortfalls text[] := '{}';
begin
	for baseline in select table_name, rows_before from prune_reference_row_counts order by table_name
	loop
		execute format('select count(*) from %I', baseline.table_name) into rows_after;
		if rows_after < baseline.rows_before then
			shortfalls := shortfalls || format(
				'%s: %s of %s rows, short by %s',
				baseline.table_name, rows_after, baseline.rows_before,
				baseline.rows_before - rows_after
			);
		else
			raise notice 'reference data preserved: % holds % rows', baseline.table_name, rows_after;
		end if;
	end loop;

	if cardinality(shortfalls) > 0 then
		raise exception
			'the prune deleted reference data it must preserve (%). Nothing was committed.',
			array_to_string(shortfalls, '; ')
			using hint = 'A foreign key into addresses, regions or contacts has become ON DELETE CASCADE. Read the header of this file and re-check the cascade closure with section 0''s doomed query.';
	end if;
end $preserved$;

commit;

-- Staging goes back to mirroring the prod schema. Dropping by prefix rather
-- than by name means this removes whatever section 0 decided to build,
-- including indexes left behind by an earlier run that died partway.
do $cleanup$
declare
	idx text;
	dropped int := 0;
begin
	for idx in
		select indexname from pg_indexes
		where schemaname = 'public' and indexname like 'tmp\_prune\_%'
	loop
		execute format('drop index if exists %I', idx);
		dropped := dropped + 1;
	end loop;
	raise notice 'transient indexes dropped: %', dropped;
end $cleanup$;

-- FULL, not plain. A plain `vacuum` marks dead tuples reusable *inside* the
-- table and hands nothing back to the filesystem, so after deleting 80% of
-- these rows the database would occupy exactly as much Railway volume as
-- before — history hidden rather than removed, which is the opposite of why
-- this file exists. `vacuum full` rewrites each table and its indexes and
-- returns the space.
--
-- The usual objection to `vacuum full` is that it needs room for a second copy
-- of the table while it runs. Here it does not really apply: the copy is made
-- *after* the prune, so it is the ~20% that survived, and peak usage is about
-- 1.2x the old table rather than 2x. It takes an ACCESS EXCLUSIVE lock, which
-- is free on a database this script has just finished wiping and reloading.
--
-- Run after the transient indexes are dropped, so none of them get rewritten
-- on the way out.
vacuum (full, analyze) inspections;
vacuum (full, analyze) applications;
vacuum (full, analyze) application_batches;
vacuum (full, analyze) collections;
vacuum (full, analyze) collection_species;
vacuum (full, analyze) samples;
vacuum (full, analyze) sample_species;
vacuum (full, analyze) comments;
vacuum (full, analyze) additional_personnel;
vacuum (full, analyze) tag_items;
vacuum (full, analyze) service_requests;

\echo '--> database size after prune:'
select pg_size_pretty(pg_database_size(current_database())) as db_size;

\echo '--> remaining operational rows:'
select 'inspections' as table_name, count(*) as rows, min(inspection_date) as oldest from inspections
union all select 'applications', count(*), min(application_date) from applications
union all select 'collections', count(*), min(coalesce(collected_at::date, collection_date)) from collections
union all select 'samples', count(*), null from samples
union all select 'service_requests', count(*), min(request_date) from service_requests
union all select 'biocontrol_actions', count(*), min(biocontrol_date) from biocontrol_actions
union all select 'source_reductions', count(*), min(source_reduction_date) from source_reductions
union all select 'outreach_actions', count(*), min(outreach_date) from outreach_actions
union all select 'assignments', count(*), min(assignment_date) from assignments
union all select 'comments', count(*), null from comments
order by table_name;
