-- migrate:up

-- One index table behind global search in `apps/web`, plus the triggers that
-- keep it in step with the thirteen tables it is derived from.
--
-- Specced in https://github.com/thebigthing313/simmer-mosquito/issues/275,
-- section 2. There is no safe intermediate state here: a partially indexed
-- corpus fails as *missing results* rather than as an error, so this lands as
-- one file: extensions, table, thirteen projection functions, the triggers,
-- three indexes and the backfill.
--
-- Why a trigger rather than an application write: there are at least five doors
-- into the corpus tables. `writeCommands` is the command choke point, but
-- `apps/server/src/lifecycle-comment.ts` writes comments beside it,
-- `packages/db/src/domains/record-deletion.ts` soft-deletes with raw
-- `deleted_at = now()`, `record-merge.ts` rewrites `comments.entity_id` with raw
-- SQL, and whatever bulk-loaded production went through none of them. An indexer
-- inside `writeCommands` would silently miss soft deletes, merges and every
-- import, and "silently incomplete" is the exact failure that ruled out a
-- client-side search in the first place.
--
-- Not a `GENERATED` column: `202607070001_sync_owned_centroid_columns.sql`
-- records that this repo has already abandoned generated columns once, because
-- logical replication does not publish them.

-- `pg_trgm` serves the fuzzy branch. `btree_gin` is what lets `organization_id`
-- sit *inside* a GIN index rather than beside it, so the tenancy filter is
-- served by the same index scan rather than by a filter after it. Column order
-- inside a GIN index does not matter, which contradicts btree instinct and is
-- worth knowing before reading the index list at the bottom of this file.
create extension if not exists pg_trgm;
create extension if not exists btree_gin;

create table search_documents (
	-- The source table *is* the document class; comments sit at `'comments'`
	-- rather than under a second concept beside the table name.
	source_table text not null,
	source_id uuid not null,
	organization_id uuid not null,
	-- `setweight(identifier fields, 'A') || setweight(prose fields, 'B')`, both
	-- under the `'english'` configuration. One configuration, because
	-- `to_tsquery` takes one and a mixed document would force the reader to build
	-- two queries and `||` them forever. `C` and `D` go unused.
	search_vector tsvector not null,
	-- One element per identifier field, already case-folded, so `exact` is
	-- `lower(q) = any(search_text)` with no per-row function call. An array and
	-- not a joined string: with a joined string an equality match can only ever
	-- fire on a document holding exactly one identifier field, which excludes 32%
	-- of the record corpus.
	search_text text[],
	-- The same elements joined. `gin_trgm_ops` does not index an array, which is
	-- the whole reason this column exists beside the one above.
	search_text_joined text,
	-- Column key to text, for every indexed field. The reader composes titles and
	-- recovers the matched field from here, so composition needs no join back to
	-- the source table.
	fields jsonb not null,
	-- Only what composition needs and the indexed fields do not:
	-- `routes.route_type`, which picks between the trap tree and the habitat
	-- tree, and `comments.entity_type` plus `entity_id`.
	display jsonb not null default '{}'::jsonb,
	primary key (source_table, source_id)
);

comment on table search_documents is
	'Derived search index over twelve record tables plus comments. Trigger-maintained; holds no column a client is not already allowed to receive through sync. No sync shape and no collection module.';

-- Composition itself lives in TypeScript, in the endpoint. What lives here is
-- only the projection: which columns are indexed, at which weight. The per-table
-- display rules are real (`service_requests.display_name` is an integer, a route
-- reads as its name plus its type) and written in plpgsql they could not be unit
-- tested the way this repo tests, inside a file that is immutable once applied.
create function search_document_build(
	p_source_table text,
	p_source_id uuid,
	p_organization_id uuid,
	p_ident_keys text[],
	p_prose_keys text[],
	p_fields jsonb,
	p_display jsonb
) returns search_documents
language plpgsql immutable as $fn$
declare
	doc search_documents;
	ident text[];
	prose text[];
begin
	-- Declared order is preserved, because the reader breaks a tie on the matched
	-- field by taking the first field in declared order.
	select coalesce(array_agg(lower(s.v) order by t.ord), '{}'::text[])
		into ident
		from unnest(p_ident_keys) with ordinality t(k, ord)
		cross join lateral (select nullif(btrim(p_fields ->> t.k), '') as v) s
		where s.v is not null;

	select coalesce(array_agg(s.v order by t.ord), '{}'::text[])
		into prose
		from unnest(p_prose_keys) with ordinality t(k, ord)
		cross join lateral (select nullif(btrim(p_fields ->> t.k), '') as v) s
		where s.v is not null;

	doc.source_table := p_source_table;
	doc.source_id := p_source_id;
	doc.organization_id := p_organization_id;
	doc.search_text := nullif(ident, '{}'::text[]);
	doc.search_text_joined := nullif(array_to_string(ident, ' '), '');
	doc.search_vector :=
		setweight(to_tsvector('english', array_to_string(ident, ' ')), 'A')
		|| setweight(to_tsvector('english', array_to_string(prose, ' ')), 'B');
	doc.fields := p_fields;
	doc.display := p_display;
	return doc;
end;
$fn$;

-- One projection function per corpus table, called by both the trigger and the
-- backfill, so the field list is written once inside a file that can never be
-- edited afterwards.

create function search_document_from_habitats(r habitats) returns search_documents
language sql immutable as $fn$
	select search_document_build('habitats', r.id, r.organization_id,
		array['habitat_name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'habitat_name', r.habitat_name, 'description', r.description)),
		'{}'::jsonb);
$fn$;

create function search_document_from_traps(r traps) returns search_documents
language sql immutable as $fn$
	select search_document_build('traps', r.id, r.organization_id,
		array['trap_name', 'trap_code'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'trap_name', r.trap_name, 'trap_code', r.trap_code, 'description', r.description)),
		'{}'::jsonb);
$fn$;

create function search_document_from_service_requests(r service_requests) returns search_documents
language sql immutable as $fn$
	select search_document_build('service_requests', r.id, r.organization_id,
		array['display_name'], array['details'],
		jsonb_strip_nulls(jsonb_build_object(
			'display_name', r.display_name::text, 'details', r.details)),
		'{}'::jsonb);
$fn$;

create function search_document_from_contacts(r contacts) returns search_documents
language sql immutable as $fn$
	select search_document_build('contacts', r.id, r.organization_id,
		array['contact_name', 'company', 'email', 'preferred_phone', 'alternate_phone'],
		array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'contact_name', r.contact_name, 'company', r.company, 'email', r.email,
			'preferred_phone', r.preferred_phone, 'alternate_phone', r.alternate_phone)),
		'{}'::jsonb);
$fn$;

create function search_document_from_addresses(r addresses) returns search_documents
language sql immutable as $fn$
	select search_document_build('addresses', r.id, r.organization_id,
		array['display_name', 'locality', 'postal_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'display_name', r.display_name, 'locality', r.locality,
			'postal_code', r.postal_code)),
		'{}'::jsonb);
$fn$;

create function search_document_from_regions(r regions) returns search_documents
language sql immutable as $fn$
	select search_document_build('regions', r.id, r.organization_id,
		array['name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object('name', r.name, 'description', r.description)),
		'{}'::jsonb);
$fn$;

-- `route_type` rides in `display`, not in `fields`: it is not indexed text, and
-- the client needs it to pick between the trap tree and the habitat tree.
create function search_document_from_routes(r routes) returns search_documents
language sql immutable as $fn$
	select search_document_build('routes', r.id, r.organization_id,
		array['route_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('route_name', r.route_name)),
		jsonb_strip_nulls(jsonb_build_object('route_type', r.route_type)));
$fn$;

create function search_document_from_assignments(r assignments) returns search_documents
language sql immutable as $fn$
	select search_document_build('assignments', r.id, r.organization_id,
		array['assignment_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('assignment_name', r.assignment_name)),
		'{}'::jsonb);
$fn$;

create function search_document_from_missions(r missions) returns search_documents
language sql immutable as $fn$
	select search_document_build('missions', r.id, r.organization_id,
		array['mission_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('mission_name', r.mission_name)),
		'{}'::jsonb);
$fn$;

-- No identifier field at all, so its `search_text` is null and it is reachable
-- by full text alone.
create function search_document_from_requested_control_actions(r requested_control_actions)
returns search_documents
language sql immutable as $fn$
	select search_document_build('requested_control_actions', r.id, r.organization_id,
		array[]::text[], array['summary'],
		jsonb_strip_nulls(jsonb_build_object('summary', r.summary)),
		'{}'::jsonb);
$fn$;

create function search_document_from_samples(r samples) returns search_documents
language sql immutable as $fn$
	select search_document_build('samples', r.id, r.organization_id,
		array['display_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('display_name', r.display_name)),
		'{}'::jsonb);
$fn$;

-- `weather_sources.organization_id` is nullable: a null means a platform-owned
-- station, which is nobody's agency record. The document comes out with a null
-- tenancy column and the trigger drops it, which is the one place in this file
-- where a corpus row is deliberately not indexed.
create function search_document_from_weather_sources(r weather_sources) returns search_documents
language sql immutable as $fn$
	select search_document_build('weather_sources', r.id, r.organization_id,
		array['source_name', 'source_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'source_name', r.source_name, 'source_code', r.source_code)),
		'{}'::jsonb);
$fn$;

-- One document per comment, not a roll-up per commented record: a roll-up goes
-- stale on every edit anywhere in the thread rather than on the row that
-- changed. A comment does not borrow its target's name, so a rename never
-- rewrites it.
create function search_document_from_comments(r comments) returns search_documents
language sql immutable as $fn$
	select search_document_build('comments', r.id, r.organization_id,
		array[]::text[], array['comment_text'],
		jsonb_build_object('comment_text', r.comment_text),
		jsonb_build_object('entity_type', r.entity_type, 'entity_id', r.entity_id));
$fn$;

-- One trigger function for all thirteen tables, dispatching to the projection by
-- table name. The alternative is thirteen near-identical trigger functions and
-- thirteen places for the soft-delete branch to be got wrong.
--
-- A soft delete *deletes* the document, and re-inserts if `deleted_at` is ever
-- cleared. No tombstone: this is derived data with nothing to audit and no
-- foreign keys pointing at it, and a `deleted_at` here would be a second place
-- the filter can be forgotten. A soft delete is an `UPDATE`, so the branch is on
-- `new.deleted_at is not null`; a `before delete` trigger would never fire.
--
-- Deactivation is different and deliberate: a deactivated record still exists
-- and still has a page, so it stays in the index.
create function search_documents_sync() returns trigger
language plpgsql as $fn$
declare
	doc search_documents;
begin
	if tg_op = 'DELETE' then
		delete from search_documents
			where source_table = tg_table_name and source_id = old.id;
		return old;
	end if;

	if new.deleted_at is not null then
		delete from search_documents
			where source_table = tg_table_name and source_id = new.id;
		return new;
	end if;

	-- The projection is called in `FROM`, so it expands to the seven columns
	-- `doc` holds. Selected as a bare expression it is *one* composite column,
	-- and `INTO` a row variable then quietly fills nothing.
	execute format('select d.* from search_document_from_%I($1) d', tg_table_name)
		into doc using new;

	if doc.organization_id is null then
		delete from search_documents
			where source_table = tg_table_name and source_id = new.id;
		return new;
	end if;

	insert into search_documents
		select (doc).*
		on conflict (source_table, source_id) do update set
			organization_id = excluded.organization_id,
			search_vector = excluded.search_vector,
			search_text = excluded.search_text,
			search_text_joined = excluded.search_text_joined,
			fields = excluded.fields,
			display = excluded.display;

	return new;
end;
$fn$;

-- Two triggers per table, not one. Postgres refuses a `WHEN` clause naming OLD
-- or NEW on a trigger declared for INSERT, UPDATE and DELETE at once, and the
-- `WHEN` filter is the point: `comments` is 78,424 rows and every record edit
-- stamps `updated_at`, so without it every ordinary edit writes the index.

create trigger habitats_search_document_write
	after insert or delete on habitats
	for each row execute function search_documents_sync();
create trigger habitats_search_document_update
	after update on habitats
	for each row when (
		old.habitat_name is distinct from new.habitat_name
		or old.description is distinct from new.description
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger traps_search_document_write
	after insert or delete on traps
	for each row execute function search_documents_sync();
create trigger traps_search_document_update
	after update on traps
	for each row when (
		old.trap_name is distinct from new.trap_name
		or old.trap_code is distinct from new.trap_code
		or old.description is distinct from new.description
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger service_requests_search_document_write
	after insert or delete on service_requests
	for each row execute function search_documents_sync();
create trigger service_requests_search_document_update
	after update on service_requests
	for each row when (
		old.display_name is distinct from new.display_name
		or old.details is distinct from new.details
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger contacts_search_document_write
	after insert or delete on contacts
	for each row execute function search_documents_sync();
create trigger contacts_search_document_update
	after update on contacts
	for each row when (
		old.contact_name is distinct from new.contact_name
		or old.company is distinct from new.company
		or old.email is distinct from new.email
		or old.preferred_phone is distinct from new.preferred_phone
		or old.alternate_phone is distinct from new.alternate_phone
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger addresses_search_document_write
	after insert or delete on addresses
	for each row execute function search_documents_sync();
create trigger addresses_search_document_update
	after update on addresses
	for each row when (
		old.display_name is distinct from new.display_name
		or old.locality is distinct from new.locality
		or old.postal_code is distinct from new.postal_code
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger regions_search_document_write
	after insert or delete on regions
	for each row execute function search_documents_sync();
create trigger regions_search_document_update
	after update on regions
	for each row when (
		old.name is distinct from new.name
		or old.description is distinct from new.description
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger routes_search_document_write
	after insert or delete on routes
	for each row execute function search_documents_sync();
create trigger routes_search_document_update
	after update on routes
	for each row when (
		old.route_name is distinct from new.route_name
		or old.route_type is distinct from new.route_type
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger assignments_search_document_write
	after insert or delete on assignments
	for each row execute function search_documents_sync();
create trigger assignments_search_document_update
	after update on assignments
	for each row when (
		old.assignment_name is distinct from new.assignment_name
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger missions_search_document_write
	after insert or delete on missions
	for each row execute function search_documents_sync();
create trigger missions_search_document_update
	after update on missions
	for each row when (
		old.mission_name is distinct from new.mission_name
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger requested_control_actions_search_document_write
	after insert or delete on requested_control_actions
	for each row execute function search_documents_sync();
create trigger requested_control_actions_search_document_update
	after update on requested_control_actions
	for each row when (
		old.summary is distinct from new.summary
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger samples_search_document_write
	after insert or delete on samples
	for each row execute function search_documents_sync();
create trigger samples_search_document_update
	after update on samples
	for each row when (
		old.display_name is distinct from new.display_name
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger weather_sources_search_document_write
	after insert or delete on weather_sources
	for each row execute function search_documents_sync();
create trigger weather_sources_search_document_update
	after update on weather_sources
	for each row when (
		old.source_name is distinct from new.source_name
		or old.source_code is distinct from new.source_code
		or old.organization_id is distinct from new.organization_id
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

create trigger comments_search_document_write
	after insert or delete on comments
	for each row execute function search_documents_sync();
create trigger comments_search_document_update
	after update on comments
	for each row when (
		old.comment_text is distinct from new.comment_text
		or old.entity_type is distinct from new.entity_type
		or old.entity_id is distinct from new.entity_id
		or old.deleted_at is distinct from new.deleted_at
	) execute function search_documents_sync();

-- The backfill. `materialized` keeps the projection from being re-evaluated once
-- per output column, which is what `select (f(r)).*` costs when the planner is
-- allowed to inline it.

with docs as materialized (
	select search_document_from_habitats(r) as d from habitats r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_traps(r) as d from traps r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_service_requests(r) as d
	from service_requests r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_contacts(r) as d from contacts r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_addresses(r) as d from addresses r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_regions(r) as d from regions r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_routes(r) as d from routes r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_assignments(r) as d from assignments r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_missions(r) as d from missions r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_requested_control_actions(r) as d
	from requested_control_actions r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_samples(r) as d from samples r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_weather_sources(r) as d
	from weather_sources r where r.deleted_at is null and r.organization_id is not null
) insert into search_documents select (d).* from docs;

with docs as materialized (
	select search_document_from_comments(r) as d from comments r where r.deleted_at is null
) insert into search_documents select (d).* from docs;

-- Three indexes, no partial ones. #126 is the standing lesson here that a
-- partial index goes invisible to the planner in cases nobody predicted, and
-- this table holds live rows only anyway.
--
-- `prefix` at one and two characters is served by none of these: `gin_trgm_ops`
-- degenerates below three characters and the array GIN answers equality, not
-- prefix. That is a known and measured gap, not an oversight.
create index search_documents_vector_idx
	on search_documents using gin (organization_id, search_vector);
create index search_documents_trgm_idx
	on search_documents using gin (organization_id, search_text_joined gin_trgm_ops);
create index search_documents_text_idx
	on search_documents using gin (organization_id, search_text);

analyze search_documents;

-- migrate:down

drop trigger if exists comments_search_document_update on comments;
drop trigger if exists comments_search_document_write on comments;
drop trigger if exists weather_sources_search_document_update on weather_sources;
drop trigger if exists weather_sources_search_document_write on weather_sources;
drop trigger if exists samples_search_document_update on samples;
drop trigger if exists samples_search_document_write on samples;
drop trigger if exists requested_control_actions_search_document_update on requested_control_actions;
drop trigger if exists requested_control_actions_search_document_write on requested_control_actions;
drop trigger if exists missions_search_document_update on missions;
drop trigger if exists missions_search_document_write on missions;
drop trigger if exists assignments_search_document_update on assignments;
drop trigger if exists assignments_search_document_write on assignments;
drop trigger if exists routes_search_document_update on routes;
drop trigger if exists routes_search_document_write on routes;
drop trigger if exists regions_search_document_update on regions;
drop trigger if exists regions_search_document_write on regions;
drop trigger if exists addresses_search_document_update on addresses;
drop trigger if exists addresses_search_document_write on addresses;
drop trigger if exists contacts_search_document_update on contacts;
drop trigger if exists contacts_search_document_write on contacts;
drop trigger if exists service_requests_search_document_update on service_requests;
drop trigger if exists service_requests_search_document_write on service_requests;
drop trigger if exists traps_search_document_update on traps;
drop trigger if exists traps_search_document_write on traps;
drop trigger if exists habitats_search_document_update on habitats;
drop trigger if exists habitats_search_document_write on habitats;

drop function if exists search_documents_sync();
drop function if exists search_document_from_comments(comments);
drop function if exists search_document_from_weather_sources(weather_sources);
drop function if exists search_document_from_samples(samples);
drop function if exists search_document_from_requested_control_actions(requested_control_actions);
drop function if exists search_document_from_missions(missions);
drop function if exists search_document_from_assignments(assignments);
drop function if exists search_document_from_routes(routes);
drop function if exists search_document_from_regions(regions);
drop function if exists search_document_from_addresses(addresses);
drop function if exists search_document_from_contacts(contacts);
drop function if exists search_document_from_service_requests(service_requests);
drop function if exists search_document_from_traps(traps);
drop function if exists search_document_from_habitats(habitats);
drop function if exists search_document_build(text, uuid, uuid, text[], text[], jsonb, jsonb);

drop table if exists search_documents;

-- `pg_trgm` and `btree_gin` are left installed. Both are `if not exists` above,
-- so this migration may not have been what installed them, and dropping an
-- extension a later migration has come to depend on is the more expensive half
-- of a rollback than leaving two idle extensions behind.
