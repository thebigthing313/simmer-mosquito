-- migrate:up

create or replace function set_owned_geom_from_feature_id()
returns trigger
language plpgsql
as $$
declare
  v_geom geometry(Geometry, 4326);
begin
  if new.geom is null
    or (
      tg_op = 'UPDATE'
      and new.feature_id is distinct from old.feature_id
      and old.geom is not null
      and st_equals(new.geom, old.geom)
    )
  then
    select geom into v_geom
    from spatial_features
    where id = new.feature_id;

    new.geom := v_geom;
  end if;

  return new;
end;
$$;

create or replace function pg_temp.backfill_owned_geometry(target_table regclass)
returns void
language plpgsql
as $$
declare
  has_null boolean;
begin
  execute format(
    'update %s as target
     set geom = spatial_features.geom
     from spatial_features
     where spatial_features.id = target.feature_id
       and target.geom is null',
    target_table
  );

  execute format('select exists (select 1 from %s where geom is null)', target_table)
  into has_null;

  if has_null then
    raise exception 'Cannot make %.geom not null because some rows could not be backfilled.', target_table;
  end if;
end;
$$;

alter table addresses
  add column geom geometry(Point, 4326);

alter table regions
  add column geom geometry(Polygon, 4326);

alter table traps
  add column geom geometry(Point, 4326);

alter table collections
  add column geom geometry(Point, 4326);

alter table habitats
  add column geom geometry(Geometry, 4326);

alter table inspections
  add column geom geometry(Geometry, 4326);

alter table applications
  add column geom geometry(Geometry, 4326);

alter table source_reductions
  add column geom geometry(Geometry, 4326);

alter table outreach_actions
  add column geom geometry(Geometry, 4326);

alter table biocontrol_actions
  add column geom geometry(Geometry, 4326);

alter table requested_control_actions
  add column geom geometry(Geometry, 4326);

alter table mission_items
  add column geom geometry(Geometry, 4326);

alter table service_requests
  add column geom geometry(Point, 4326);

alter table notification_registrations
  add column geom geometry(Geometry, 4326);

alter table weather_sources
  add column geom geometry(Point, 4326);

select pg_temp.backfill_owned_geometry('addresses');
select pg_temp.backfill_owned_geometry('regions');
select pg_temp.backfill_owned_geometry('traps');
select pg_temp.backfill_owned_geometry('collections');
select pg_temp.backfill_owned_geometry('habitats');
select pg_temp.backfill_owned_geometry('inspections');
select pg_temp.backfill_owned_geometry('applications');
select pg_temp.backfill_owned_geometry('source_reductions');
select pg_temp.backfill_owned_geometry('outreach_actions');
select pg_temp.backfill_owned_geometry('biocontrol_actions');
select pg_temp.backfill_owned_geometry('requested_control_actions');
select pg_temp.backfill_owned_geometry('mission_items');
select pg_temp.backfill_owned_geometry('service_requests');
select pg_temp.backfill_owned_geometry('notification_registrations');
select pg_temp.backfill_owned_geometry('weather_sources');

alter table addresses
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table regions
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table traps
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table collections
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table habitats
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint habitats_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table inspections
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint inspections_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table applications
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint applications_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table source_reductions
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint source_reductions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table outreach_actions
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint outreach_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table biocontrol_actions
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint biocontrol_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table requested_control_actions
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint requested_control_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table mission_items
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint mission_items_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table service_requests
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table notification_registrations
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  add constraint notification_registrations_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table weather_sources
  alter column geom set not null,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

create index addresses_geom_gist_idx on addresses using gist (geom) where deleted_at is null;
create index regions_geom_gist_idx on regions using gist (geom) where deleted_at is null;
create index traps_geom_gist_idx on traps using gist (geom) where deleted_at is null;
create index collections_geom_gist_idx on collections using gist (geom) where deleted_at is null;
create index habitats_geom_gist_idx on habitats using gist (geom) where deleted_at is null;
create index inspections_geom_gist_idx on inspections using gist (geom) where deleted_at is null;
create index applications_geom_gist_idx on applications using gist (geom) where deleted_at is null;
create index source_reductions_geom_gist_idx on source_reductions using gist (geom) where deleted_at is null;
create index outreach_actions_geom_gist_idx on outreach_actions using gist (geom) where deleted_at is null;
create index biocontrol_actions_geom_gist_idx on biocontrol_actions using gist (geom) where deleted_at is null;
create index requested_control_actions_geom_gist_idx on requested_control_actions using gist (geom) where deleted_at is null;
create index mission_items_geom_gist_idx on mission_items using gist (geom) where deleted_at is null;
create index service_requests_geom_gist_idx on service_requests using gist (geom) where deleted_at is null;
create index notification_registrations_geom_gist_idx on notification_registrations using gist (geom) where deleted_at is null;
create index weather_sources_geom_gist_idx on weather_sources using gist (geom) where deleted_at is null;

create trigger addresses_geom_from_feature_id
  before insert or update of feature_id, geom on addresses
  for each row execute function set_owned_geom_from_feature_id();

create trigger regions_geom_from_feature_id
  before insert or update of feature_id, geom on regions
  for each row execute function set_owned_geom_from_feature_id();

create trigger traps_geom_from_feature_id
  before insert or update of feature_id, geom on traps
  for each row execute function set_owned_geom_from_feature_id();

create trigger collections_geom_from_feature_id
  before insert or update of feature_id, geom on collections
  for each row execute function set_owned_geom_from_feature_id();

create trigger habitats_geom_from_feature_id
  before insert or update of feature_id, geom on habitats
  for each row execute function set_owned_geom_from_feature_id();

create trigger inspections_geom_from_feature_id
  before insert or update of feature_id, geom on inspections
  for each row execute function set_owned_geom_from_feature_id();

create trigger applications_geom_from_feature_id
  before insert or update of feature_id, geom on applications
  for each row execute function set_owned_geom_from_feature_id();

create trigger source_reductions_geom_from_feature_id
  before insert or update of feature_id, geom on source_reductions
  for each row execute function set_owned_geom_from_feature_id();

create trigger outreach_actions_geom_from_feature_id
  before insert or update of feature_id, geom on outreach_actions
  for each row execute function set_owned_geom_from_feature_id();

create trigger biocontrol_actions_geom_from_feature_id
  before insert or update of feature_id, geom on biocontrol_actions
  for each row execute function set_owned_geom_from_feature_id();

create trigger requested_control_actions_geom_from_feature_id
  before insert or update of feature_id, geom on requested_control_actions
  for each row execute function set_owned_geom_from_feature_id();

create trigger mission_items_geom_from_feature_id
  before insert or update of feature_id, geom on mission_items
  for each row execute function set_owned_geom_from_feature_id();

create trigger service_requests_geom_from_feature_id
  before insert or update of feature_id, geom on service_requests
  for each row execute function set_owned_geom_from_feature_id();

create trigger notification_registrations_geom_from_feature_id
  before insert or update of feature_id, geom on notification_registrations
  for each row execute function set_owned_geom_from_feature_id();

create trigger weather_sources_geom_from_feature_id
  before insert or update of feature_id, geom on weather_sources
  for each row execute function set_owned_geom_from_feature_id();

-- migrate:down

drop trigger if exists weather_sources_geom_from_feature_id on weather_sources;
drop trigger if exists notification_registrations_geom_from_feature_id on notification_registrations;
drop trigger if exists service_requests_geom_from_feature_id on service_requests;
drop trigger if exists mission_items_geom_from_feature_id on mission_items;
drop trigger if exists requested_control_actions_geom_from_feature_id on requested_control_actions;
drop trigger if exists biocontrol_actions_geom_from_feature_id on biocontrol_actions;
drop trigger if exists outreach_actions_geom_from_feature_id on outreach_actions;
drop trigger if exists source_reductions_geom_from_feature_id on source_reductions;
drop trigger if exists applications_geom_from_feature_id on applications;
drop trigger if exists inspections_geom_from_feature_id on inspections;
drop trigger if exists habitats_geom_from_feature_id on habitats;
drop trigger if exists collections_geom_from_feature_id on collections;
drop trigger if exists traps_geom_from_feature_id on traps;
drop trigger if exists regions_geom_from_feature_id on regions;
drop trigger if exists addresses_geom_from_feature_id on addresses;

drop function if exists set_owned_geom_from_feature_id();

drop index if exists weather_sources_geom_gist_idx;
drop index if exists notification_registrations_geom_gist_idx;
drop index if exists service_requests_geom_gist_idx;
drop index if exists mission_items_geom_gist_idx;
drop index if exists requested_control_actions_geom_gist_idx;
drop index if exists biocontrol_actions_geom_gist_idx;
drop index if exists outreach_actions_geom_gist_idx;
drop index if exists source_reductions_geom_gist_idx;
drop index if exists applications_geom_gist_idx;
drop index if exists inspections_geom_gist_idx;
drop index if exists habitats_geom_gist_idx;
drop index if exists collections_geom_gist_idx;
drop index if exists traps_geom_gist_idx;
drop index if exists regions_geom_gist_idx;
drop index if exists addresses_geom_gist_idx;

alter table weather_sources
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table notification_registrations
  drop constraint if exists notification_registrations_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table service_requests
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table mission_items
  drop constraint if exists mission_items_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table requested_control_actions
  drop constraint if exists requested_control_actions_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table biocontrol_actions
  drop constraint if exists biocontrol_actions_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table outreach_actions
  drop constraint if exists outreach_actions_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table source_reductions
  drop constraint if exists source_reductions_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table applications
  drop constraint if exists applications_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table inspections
  drop constraint if exists inspections_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table habitats
  drop constraint if exists habitats_geom_type_check,
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table collections
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table traps
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table regions
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;

alter table addresses
  drop column if exists geom_type,
  drop column if exists geojson,
  drop column if exists lng,
  drop column if exists lat,
  drop column if exists geom;
