-- migrate:up

-- A Treatment holds the visit, and each Chemical Application under it is one
-- Insecticide and one amount (ADR 0020, #1746). `docs/treatment-spec.md`,
-- "One migration, one cutover", is the order below, step for step.
--
-- One transaction, one cutover. The old server's chemical writes fail for the
-- minutes the deploy takes, and Electric drops the `applications` shapes whose
-- columns changed, so clients reload rather than read a half-moved table.

-- 1. The Treatment.
--
-- The visit columns keep their `application_` prefix: they are the same facts
-- under the same names. The Formulation columns are all set or all null, and a
-- backfilled Treatment leaves all three null because no provenance was recorded
-- before. The unique index on `(id, organization_id)` is what the line's
-- composite foreign key points at.
create table treatments (
  id uuid default gen_random_uuid() not null primary key,
  organization_id uuid not null references organizations (id) on delete restrict,
  application_date date not null,
  applicator_profile_id uuid references profiles (id) on delete set null,
  application_method_id uuid references application_methods (id) on delete set null,
  vehicle_id uuid references vehicles (id) on delete set null,
  equipment_id uuid references equipment (id) on delete set null,
  address_id uuid references addresses (id) on delete restrict,
  habitat_id uuid references habitats (id) on delete set null,
  inspection_id uuid references inspections (id) on delete set null,
  collection_id uuid references collections (id) on delete set null,
  requested_control_action_id uuid references requested_control_actions (id) on delete set null,
  mission_item_id uuid references mission_items (id) on delete set null,
  formulation_id uuid references formulations (id) on delete restrict,
  mix_amount double precision,
  mix_unit_id uuid references units (id) on delete restrict,
  geom geometry(Geometry, 4326) not null,
  lat double precision,
  lng double precision,
  geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  geom_type text,
  metadata jsonb,
  created_by_profile_id uuid references profiles (id) on delete set null,
  updated_by_profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles (id) on delete set null,
  constraint treatments_formulation_all_or_none check (
    (formulation_id is null and mix_amount is null and mix_unit_id is null)
    or (formulation_id is not null and mix_amount is not null and mix_unit_id is not null)
  ),
  constraint treatments_mix_amount_positive check (mix_amount > 0),
  constraint treatments_geom_type_check check (
    geometrytype(geom) = any (array[
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ])
  )
);

create trigger treatments_centroid
  before insert or update of geom on treatments
  for each row execute function set_owned_centroid();

create unique index treatments_id_organization_unique on treatments (id, organization_id);

-- 2. One Treatment per existing row, reusing the row's id.
--
-- Soft-deleted rows too, so a soft-deleted Chemical Application becomes a
-- soft-deleted Treatment over a soft-deleted line. `metadata` moves as it is
-- and is not checked again against the method's `custom_schema`. `lat`, `lng`
-- and `geom_type` are left to the centroid trigger, which computes what the
-- row already held.
insert into treatments (
  id, organization_id, application_date, applicator_profile_id, application_method_id,
  vehicle_id, equipment_id, address_id, habitat_id, inspection_id, collection_id,
  requested_control_action_id, mission_item_id, geom, metadata,
  created_by_profile_id, updated_by_profile_id, created_at, updated_at,
  deleted_at, deleted_by_profile_id
)
select
  id, organization_id, application_date, applicator_profile_id, application_method_id,
  vehicle_id, equipment_id, address_id, habitat_id, inspection_id, collection_id,
  requested_control_action_id, mission_item_id, geom, metadata,
  created_by_profile_id, updated_by_profile_id, created_at, updated_at,
  deleted_at, deleted_by_profile_id
from applications;

-- 3. Each line names its Treatment, which has its own id. No trigger stamps
-- `applications.updated_at`, so this leaves it alone.
alter table applications add column treatment_id uuid;

update applications set treatment_id = id;

alter table applications alter column treatment_id set not null;

-- 4. Comments and Additional Personnel hang on the Treatment. `entity_id` is
-- unchanged because the Treatment took the row's id. The update fires
-- `comments_search_document_update`, so comment search documents follow.
update comments set entity_type = 'treatment' where entity_type = 'application';

update additional_personnel set entity_type = 'treatment' where entity_type = 'application';

-- 5. The line's keys, and the visit indexes moving to the Treatment.
--
-- The composite key makes a line whose `organization_id` disagrees with its
-- Treatment's impossible. The line keeps its own copy for its sync shape. A
-- hard-deleted Treatment takes its lines with it, the way a line takes its
-- batch links; the app soft-deletes both.
alter table applications
  add constraint applications_treatment_fkey
  foreign key (treatment_id, organization_id)
  references treatments (id, organization_id)
  on delete cascade;

create unique index applications_active_treatment_insecticide_unique
  on applications (treatment_id, insecticide_id) where deleted_at is null;

create index applications_treatment_idx on applications (treatment_id) where deleted_at is null;

drop index applications_geom_gist_idx;
drop index applications_mission_item_idx;
drop index applications_organization_address_idx;
drop index applications_organization_collection_idx;
drop index applications_organization_date_idx;
drop index applications_organization_habitat_idx;
drop index applications_organization_inspection_idx;
drop index applications_organization_method_idx;
drop index applications_requested_control_action_idx;

create index treatments_geom_gist_idx on treatments using gist (geom) where deleted_at is null;
create index treatments_mission_item_idx on treatments (mission_item_id)
  where deleted_at is null and mission_item_id is not null;
create index treatments_organization_address_idx on treatments (organization_id, address_id)
  where deleted_at is null and address_id is not null;
create index treatments_organization_collection_idx on treatments (organization_id, collection_id)
  where deleted_at is null and collection_id is not null;
create index treatments_organization_date_idx
  on treatments (organization_id, application_date desc, created_at desc)
  where deleted_at is null;
create index treatments_organization_habitat_idx on treatments (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;
create index treatments_organization_inspection_idx on treatments (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;
create index treatments_organization_method_idx
  on treatments (organization_id, application_method_id)
  where deleted_at is null and application_method_id is not null;
create index treatments_requested_control_action_idx on treatments (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

-- 6. Treatments are a tag target. Applications never were.
alter table tags drop constraint tags_relevant_entity_types_known;

alter table tags add constraint tags_relevant_entity_types_known check (
  relevant_entity_types <@ array[
    'address', 'region', 'trap', 'habitat', 'contact', 'service_request', 'treatment'
  ]::text[]
);

-- 7. The line drops the visit. The foreign keys on these columns go with them.
drop trigger applications_centroid on applications;

alter table applications
  drop constraint applications_geom_type_check,
  drop column application_date,
  drop column applicator_profile_id,
  drop column application_method_id,
  drop column vehicle_id,
  drop column equipment_id,
  drop column address_id,
  drop column habitat_id,
  drop column inspection_id,
  drop column collection_id,
  drop column requested_control_action_id,
  drop column mission_item_id,
  drop column metadata,
  drop column geojson,
  drop column geom,
  drop column lat,
  drop column lng,
  drop column geom_type;

-- 8. Fresh statistics, so the first reads plan against the new shape.
analyze treatments;
analyze applications;

-- migrate:down

-- Lossy where a Treatment holds more than one line: each line takes its
-- Treatment's visit, and the Treatment's comments, personnel and tags stay
-- with whichever line reused its id or are dropped with it. Formulation
-- provenance has nowhere to go and is dropped.
alter table applications
  add column application_method_id uuid references application_methods (id) on delete set null,
  add column applicator_profile_id uuid references profiles (id) on delete set null,
  add column application_date date,
  add column address_id uuid references addresses (id) on delete restrict,
  add column vehicle_id uuid references vehicles (id) on delete set null,
  add column equipment_id uuid references equipment (id) on delete set null,
  add column habitat_id uuid references habitats (id) on delete set null,
  add column collection_id uuid references collections (id) on delete set null,
  add column inspection_id uuid references inspections (id) on delete set null,
  add column metadata jsonb,
  add column requested_control_action_id uuid
    references requested_control_actions (id) on delete set null,
  add column mission_item_id uuid references mission_items (id) on delete set null,
  add column geom geometry(Geometry, 4326),
  add column lat double precision,
  add column lng double precision,
  add column geom_type text;

update applications a
set
  application_method_id = t.application_method_id,
  applicator_profile_id = t.applicator_profile_id,
  application_date = t.application_date,
  address_id = t.address_id,
  vehicle_id = t.vehicle_id,
  equipment_id = t.equipment_id,
  habitat_id = t.habitat_id,
  collection_id = t.collection_id,
  inspection_id = t.inspection_id,
  metadata = t.metadata,
  requested_control_action_id = t.requested_control_action_id,
  mission_item_id = t.mission_item_id,
  geom = t.geom,
  lat = t.lat,
  lng = t.lng,
  geom_type = t.geom_type
from treatments t
where t.id = a.treatment_id;

alter table applications
  alter column application_date set not null,
  alter column geom set not null,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add constraint applications_geom_type_check check (
    geometrytype(geom) = any (array[
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ])
  );

create trigger applications_centroid
  before insert or update of geom on applications
  for each row execute function set_owned_centroid();

create index applications_geom_gist_idx on applications using gist (geom) where deleted_at is null;
create index applications_mission_item_idx on applications (mission_item_id)
  where deleted_at is null and mission_item_id is not null;
create index applications_organization_address_idx on applications (organization_id, address_id)
  where deleted_at is null and address_id is not null;
create index applications_organization_collection_idx
  on applications (organization_id, collection_id)
  where deleted_at is null and collection_id is not null;
create index applications_organization_date_idx
  on applications (organization_id, application_date desc, created_at desc)
  where deleted_at is null;
create index applications_organization_habitat_idx on applications (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;
create index applications_organization_inspection_idx
  on applications (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;
create index applications_organization_method_idx
  on applications (organization_id, application_method_id)
  where deleted_at is null and application_method_id is not null;
create index applications_requested_control_action_idx
  on applications (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

delete from tag_items where entity_type = 'treatment';

update tags
  set relevant_entity_types = array_remove(relevant_entity_types, 'treatment')
  where 'treatment' = any (relevant_entity_types);

alter table tags drop constraint tags_relevant_entity_types_known;

alter table tags add constraint tags_relevant_entity_types_known check (
  relevant_entity_types <@ array[
    'address', 'region', 'trap', 'habitat', 'contact', 'service_request'
  ]::text[]
);

update comments set entity_type = 'application' where entity_type = 'treatment';

update additional_personnel set entity_type = 'application' where entity_type = 'treatment';

drop index applications_treatment_idx;
drop index applications_active_treatment_insecticide_unique;

alter table applications
  drop constraint applications_treatment_fkey,
  drop column treatment_id;

drop table treatments;
