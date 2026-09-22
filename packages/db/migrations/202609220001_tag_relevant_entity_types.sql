-- migrate:up

-- A Tag names the record types it is meant for.
--
-- `docs/tag-relevance-spec.md` is the whole feature. The set is a preference the
-- tag picker reads to decide which Tags to offer first, and nothing enforces it:
-- the server keeps accepting `fieldWork.assignTag` for any active Tag on any
-- taggable target of the same Organization.
--
-- The values are the snake_case words `tag_items.entity_type` already stores, so
-- the picker compares against the column with no bridge on the read. That column
-- keeps its `text` with no constraint; this check is on the new one alone.
--
-- `not null default '{}'`, where the empty set means relevant everywhere. A
-- nullable column would give that one idea two spellings with a branch owed at
-- every reader, and the default backfills every existing Tag with no data step.
--
-- The check enforces membership and nothing else. `<@` passes on the empty array
-- and refuses an unknown name; duplicates and ordering are the `updateTag`
-- normalizer's job. No static gate reads a SQL check's member list, so
-- `packages/db/src/tests/integration/tag-relevance.integration.test.ts` reads
-- this constraint back out of `pg_constraint` and holds it to the domain
-- register, which is what ADR 0018's nine geometry CHECKs already do.

alter table tags
  add column relevant_entity_types text[] not null default '{}';

alter table tags
  add constraint tags_relevant_entity_types_known
  check (relevant_entity_types <@ array['address','region','trap','habitat','contact','service_request']::text[]);

-- migrate:down

alter table tags
  drop constraint tags_relevant_entity_types_known;

alter table tags
  drop column relevant_entity_types;
