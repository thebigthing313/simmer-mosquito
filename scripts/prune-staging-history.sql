-- Trim a freshly cloned staging database to a recent window of operational
-- history. Run against STAGING only, after scripts/clone-prod-to-staging.ps1 has
-- restored the dump. Never run this against production.
--
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -v cutoff=2023-08-07 \
--     -f scripts/prune-staging-history.sql
--
-- Why: prod carries operational records back to 2011 — roughly half a million
-- inspections and two hundred thousand applications. Staging exists to make
-- local dev realistic, and three years of history does that as well as fifteen
-- while leaving a database that syncs, re-snapshots, and restores in a fraction
-- of the time.
--
-- What is NOT pruned: reference data an agency accumulates rather than performs
-- — habitats, traps, addresses, regions, contacts, routes, taxonomy, methods,
-- products, units, profiles, memberships. Deleting those would change what the
-- app *is*, not how much history it holds, and a habitat is still the habitat it
-- was in 2011.
--
-- Rows that cannot be dated are KEPT. Every predicate below is `<` against a
-- column that may be null, and `null < date` is null, so an undatable row falls
-- through every delete. That is the safe direction: staging carrying a little
-- extra beats staging silently losing a record whose date column was empty.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 0. Indexes the delete cannot run without
-- ---------------------------------------------------------------------------
-- Seven columns referencing `inspections` and `collections` are ON DELETE SET
-- NULL with **no index** on the referencing side. Postgres enforces that by
-- looking up the children of each deleted parent, so without an index every one
-- of ~400,000 deleted inspections sequentially scans `applications` (218,000
-- rows) and four smaller tables. The first attempt at this prune ran past ten
-- minutes and was killed; with these indexes it is a couple of minutes.
--
-- Built here and dropped at the end rather than added to the schema: staging is
-- meant to mirror prod, and this file must not be the thing that quietly makes
-- it stop doing so. The gap is real in production too — deleting an inspection
-- through the app pays the same scans — but that is a migration and a decision
-- about write patterns, not a side effect of a clone script.

create index if not exists tmp_prune_applications_inspection_id on applications (inspection_id);
create index if not exists tmp_prune_applications_collection_id on applications (collection_id);
create index if not exists tmp_prune_biocontrol_inspection_id on biocontrol_actions (inspection_id);
create index if not exists tmp_prune_outreach_inspection_id on outreach_actions (inspection_id);
create index if not exists tmp_prune_rca_inspection_id on requested_control_actions (inspection_id);
create index if not exists tmp_prune_rca_collection_id on requested_control_actions (collection_id);
create index if not exists tmp_prune_source_reduction_inspection_id on source_reductions (inspection_id);

begin;

\echo '--> pruning operational history older than' :'cutoff'

-- ---------------------------------------------------------------------------
-- 1. The two RESTRICT edges, which have to go first
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
-- 2. The dated roots
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
-- 3. Polymorphic children, which no foreign key protects
-- ---------------------------------------------------------------------------
-- `comments`, `additional_personnel`, `tag_items`, `assignment_items`, and
-- `route_items` address their parent as (entity_type, entity_id) with no FK, so
-- nothing above touched them and every one of them is now potentially pointing
-- at a row that no longer exists. An orphan here is worse than clutter: the
-- comment thread on a habitat detail page reads its rows by entity id, so a
-- stale row surfaces as a comment attached to whatever later reuses that id.
--
-- entity_type is stored snake_case and singular. Pairs whose parent is
-- reference data (habitat, trap, contact) are listed anyway — they cost one
-- cheap anti-join each and mean this loop is the full map of the polymorphic
-- graph rather than a subset someone has to re-derive when a new type appears.

do $$
declare
	link record;
	removed bigint;
begin
	for link in
		select * from (values
			('comments', 'inspection', 'inspections'),
			('comments', 'collection', 'collections'),
			('comments', 'sample', 'samples'),
			('comments', 'service_request', 'service_requests'),
			('comments', 'assignment', 'assignments'),
			('comments', 'habitat', 'habitats'),
			('comments', 'contact', 'contacts'),
			('additional_personnel', 'inspection', 'inspections'),
			('additional_personnel', 'application', 'applications'),
			('additional_personnel', 'collection', 'collections'),
			('tag_items', 'service_request', 'service_requests'),
			('tag_items', 'habitat', 'habitats'),
			('tag_items', 'trap', 'traps'),
			('assignment_items', 'service_request', 'service_requests'),
			('assignment_items', 'habitat', 'habitats'),
			('route_items', 'habitat', 'habitats'),
			('route_items', 'trap', 'traps')
		) as t(child_table, entity_type, parent_table)
	loop
		execute format(
			'delete from %I c where c.entity_type = %L
			   and not exists (select 1 from %I p where p.id = c.entity_id)',
			link.child_table, link.entity_type, link.parent_table
		);
		get diagnostics removed = row_count;
		if removed > 0 then
			raise notice 'orphans removed: % % -> %', removed, link.child_table, link.entity_type;
		end if;
	end loop;
end $$;

commit;

-- Staging goes back to mirroring the prod schema.
drop index if exists tmp_prune_applications_inspection_id;
drop index if exists tmp_prune_applications_collection_id;
drop index if exists tmp_prune_biocontrol_inspection_id;
drop index if exists tmp_prune_outreach_inspection_id;
drop index if exists tmp_prune_rca_inspection_id;
drop index if exists tmp_prune_rca_collection_id;
drop index if exists tmp_prune_source_reduction_inspection_id;

-- Half a million dead tuples otherwise sit in the table until autovacuum
-- notices, and the point of this file is a staging database that is actually
-- smaller rather than one that merely hides its history.
vacuum (analyze) inspections;
vacuum (analyze) applications;
vacuum (analyze) collections;
vacuum (analyze) comments;

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
