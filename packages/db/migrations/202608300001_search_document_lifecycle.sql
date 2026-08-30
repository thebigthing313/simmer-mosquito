-- migrate:up

-- Carry `is_active` into the search document for the three corpus tables that
-- have it: `habitats`, `traps` and `weather_sources`.
--
-- https://github.com/thebigthing313/simmer-mosquito/issues/289. Every projection
-- in 202608260001 passed an empty display payload, so a retired record came back
-- beside an active one and rendered identically. Retirement is not deletion: the
-- row is present and inactive, a soft-deleted row has no document at all, and
-- both of those stay true here. A retired record is still indexed and still
-- returned, because searching for a site the agency stopped working is an
-- ordinary thing to do. What changes is that the result says which it is.
--
-- **Ranking is untouched.** `is_active` rides in `display`, exactly as
-- `routes.route_type` does, so it reaches neither `search_text` nor
-- `search_vector` and no query's class, score or order moves. The reader ranks
-- by match class before score, so a lifecycle term put in the wrong half would
-- have moved records nobody asked to move.
--
-- The value is text, `'true'` or `'false'`, because the reader types `display`
-- as `Record<string, string>`. One spelling for all three tables.

create or replace function search_document_from_habitats(r habitats) returns search_documents
language sql immutable as $fn$
	select search_document_build('habitats', r.id, r.organization_id,
		array['habitat_name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'habitat_name', r.habitat_name, 'description', r.description)),
		jsonb_build_object('is_active', r.is_active::text));
$fn$;

create or replace function search_document_from_traps(r traps) returns search_documents
language sql immutable as $fn$
	select search_document_build('traps', r.id, r.organization_id,
		array['trap_name', 'trap_code'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'trap_name', r.trap_name, 'trap_code', r.trap_code, 'description', r.description)),
		jsonb_build_object('is_active', r.is_active::text));
$fn$;

create or replace function search_document_from_weather_sources(r weather_sources) returns search_documents
language sql immutable as $fn$
	select search_document_build('weather_sources', r.id, r.organization_id,
		array['source_name', 'source_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'source_name', r.source_name, 'source_code', r.source_code)),
		jsonb_build_object('is_active', r.is_active::text));
$fn$;

-- The update triggers gate on which columns changed, so a column the document
-- now depends on has to be named in the gate. Without this, retiring a record
-- would leave its document saying the record is active, and the failure would
-- be a stale document rather than an error.
--
-- Replaced by dropping and recreating rather than `create or replace trigger`,
-- so the statement means the same thing on every version this schema is applied
-- to. The write triggers are unchanged and are deliberately not touched:
-- `pnpm check:search-corpus` reads the corpus's table list off them.

drop trigger habitats_search_document_update on habitats;
create trigger habitats_search_document_update
	after update on habitats
	for each row when (
		old.habitat_name is distinct from new.habitat_name
		or old.description is distinct from new.description
		or old.is_active is distinct from new.is_active
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

drop trigger traps_search_document_update on traps;
create trigger traps_search_document_update
	after update on traps
	for each row when (
		old.trap_name is distinct from new.trap_name
		or old.trap_code is distinct from new.trap_code
		or old.description is distinct from new.description
		or old.is_active is distinct from new.is_active
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

drop trigger weather_sources_search_document_update on weather_sources;
create trigger weather_sources_search_document_update
	after update on weather_sources
	for each row when (
		old.source_name is distinct from new.source_name
		or old.source_code is distinct from new.source_code
		or old.organization_id is distinct from new.organization_id
		or old.is_active is distinct from new.is_active
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

-- Re-project the rows already in the index. A function change with no rewrite
-- is correct for every row written after it and stale for every row written
-- before, which is the shape of bug that ships green.
--
-- Only `display` is written back. The projections' indexed halves are byte for
-- byte what they were, so the vector, the text arrays and `fields` are left
-- alone and the ten tables without a lifecycle are not touched at all.
--
-- `materialized` for the same reason the original backfill uses it: without it
-- the planner inlines the projection and re-evaluates it once per output column.

with docs as materialized (
	select search_document_from_habitats(r) as d from habitats r where r.deleted_at is null
)
insert into search_documents select (d).* from docs
on conflict (source_table, source_id) do update set display = excluded.display;

with docs as materialized (
	select search_document_from_traps(r) as d from traps r where r.deleted_at is null
)
insert into search_documents select (d).* from docs
on conflict (source_table, source_id) do update set display = excluded.display;

with docs as materialized (
	select search_document_from_weather_sources(r) as d
	from weather_sources r where r.deleted_at is null and r.organization_id is not null
)
insert into search_documents select (d).* from docs
on conflict (source_table, source_id) do update set display = excluded.display;

-- migrate:down

create or replace function search_document_from_habitats(r habitats) returns search_documents
language sql immutable as $fn$
	select search_document_build('habitats', r.id, r.organization_id,
		array['habitat_name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'habitat_name', r.habitat_name, 'description', r.description)),
		'{}'::jsonb);
$fn$;

create or replace function search_document_from_traps(r traps) returns search_documents
language sql immutable as $fn$
	select search_document_build('traps', r.id, r.organization_id,
		array['trap_name', 'trap_code'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'trap_name', r.trap_name, 'trap_code', r.trap_code, 'description', r.description)),
		'{}'::jsonb);
$fn$;

create or replace function search_document_from_weather_sources(r weather_sources) returns search_documents
language sql immutable as $fn$
	select search_document_build('weather_sources', r.id, r.organization_id,
		array['source_name', 'source_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'source_name', r.source_name, 'source_code', r.source_code)),
		'{}'::jsonb);
$fn$;

drop trigger habitats_search_document_update on habitats;
create trigger habitats_search_document_update
	after update on habitats
	for each row when (
		old.habitat_name is distinct from new.habitat_name
		or old.description is distinct from new.description
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

drop trigger traps_search_document_update on traps;
create trigger traps_search_document_update
	after update on traps
	for each row when (
		old.trap_name is distinct from new.trap_name
		or old.trap_code is distinct from new.trap_code
		or old.description is distinct from new.description
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

drop trigger weather_sources_search_document_update on weather_sources;
create trigger weather_sources_search_document_update
	after update on weather_sources
	for each row when (
		old.source_name is distinct from new.source_name
		or old.source_code is distinct from new.source_code
		or old.organization_id is distinct from new.organization_id
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

update search_documents set display = '{}'::jsonb
	where source_table in ('habitats', 'traps', 'weather_sources');
