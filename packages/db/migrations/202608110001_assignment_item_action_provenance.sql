-- migrate:up

-- Assignment stops record which surveillance record proved the work, the same
-- way mission items already point at the control action performed at them.
--
-- Until now an assignment item's progress was a bare pair of timestamps:
-- `completed_at` said a stop was handled but nothing said what handled it. The
-- link lived only in the product UI, which recorded the inspection and then
-- sent `completeAssignmentItem` as a second, unrelated write. Nothing survived
-- in the database, so "what did this stop produce" and "which stop produced
-- this inspection" were both unanswerable.
--
-- `collections` gets two columns rather than one because a collection row spans
-- two field visits: `started_at`/`set_by_profile_id` when the trap is set and
-- `collected_at`/`collected_by_profile_id` when it is emptied. Those are
-- routinely different days and therefore different assignments. One column
-- would let the collect visit overwrite the set visit's provenance, which is
-- the fact most worth keeping. `recordCollectedTrapCollection` performs both in
-- one go and sets both columns to the same item.
--
-- The indexes here are deliberately NOT partial. Every comparable foreign key
-- in this schema is indexed `where deleted_at is null` for the app's
-- soft-delete reads, and referential integrity cannot use a partial index at
-- all — sixteen columns are already in that state and each one looks covered
-- (see issue #126 and docs/deployment.md). These are `on delete set null`, so a
-- hard-deleted assignment item makes Postgres scan both of these tables, and
-- `inspections` and `collections` are among the fastest-growing in the schema.
-- A plain index serves the app lookup and referential integrity both.

alter table inspections
  add column assignment_item_id uuid references assignment_items(id) on delete set null;

create index inspections_assignment_item_idx
  on inspections (assignment_item_id);

alter table collections
  add column set_assignment_item_id uuid references assignment_items(id) on delete set null,
  add column collected_assignment_item_id uuid references assignment_items(id) on delete set null;

create index collections_set_assignment_item_idx
  on collections (set_assignment_item_id);

create index collections_collected_assignment_item_idx
  on collections (collected_assignment_item_id);

-- migrate:down

drop index if exists collections_collected_assignment_item_idx;
drop index if exists collections_set_assignment_item_idx;

alter table collections
  drop column if exists collected_assignment_item_id,
  drop column if exists set_assignment_item_id;

drop index if exists inspections_assignment_item_idx;

alter table inspections
  drop column if exists assignment_item_id;
