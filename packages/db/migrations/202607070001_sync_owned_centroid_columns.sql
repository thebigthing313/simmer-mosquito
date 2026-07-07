-- migrate:up

-- Convert the generated centroid/type columns (lat, lng, geom_type) into plain
-- columns maintained by a trigger so ElectricSQL can stream them. Postgres
-- logical replication does not publish GENERATED columns, which forced a
-- separate server fetch for coordinates alongside the synced row. geojson stays
-- generated and server-only (unbounded payload; served by /map/* endpoints).
--
-- ALTER COLUMN ... DROP EXPRESSION (PG13+) drops the generation expression while
-- retaining the already-materialized values, so no backfill is required.

create or replace function set_owned_centroid()
returns trigger
language plpgsql
as $$
begin
  new.lat := st_y(st_centroid(new.geom));
  new.lng := st_x(st_centroid(new.geom));
  new.geom_type := lower(st_geometrytype(new.geom));
  return new;
end;
$$;

alter table addresses
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table regions
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table traps
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table collections
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table habitats
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table inspections
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table applications
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table source_reductions
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table outreach_actions
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table biocontrol_actions
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table requested_control_actions
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table mission_items
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table service_requests
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table notification_registrations
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

alter table weather_sources
  alter column lat drop expression,
  alter column lng drop expression,
  alter column geom_type drop expression;

create trigger addresses_centroid
  before insert or update of geom on addresses
  for each row execute function set_owned_centroid();

create trigger regions_centroid
  before insert or update of geom on regions
  for each row execute function set_owned_centroid();

create trigger traps_centroid
  before insert or update of geom on traps
  for each row execute function set_owned_centroid();

create trigger collections_centroid
  before insert or update of geom on collections
  for each row execute function set_owned_centroid();

create trigger habitats_centroid
  before insert or update of geom on habitats
  for each row execute function set_owned_centroid();

create trigger inspections_centroid
  before insert or update of geom on inspections
  for each row execute function set_owned_centroid();

create trigger applications_centroid
  before insert or update of geom on applications
  for each row execute function set_owned_centroid();

create trigger source_reductions_centroid
  before insert or update of geom on source_reductions
  for each row execute function set_owned_centroid();

create trigger outreach_actions_centroid
  before insert or update of geom on outreach_actions
  for each row execute function set_owned_centroid();

create trigger biocontrol_actions_centroid
  before insert or update of geom on biocontrol_actions
  for each row execute function set_owned_centroid();

create trigger requested_control_actions_centroid
  before insert or update of geom on requested_control_actions
  for each row execute function set_owned_centroid();

create trigger mission_items_centroid
  before insert or update of geom on mission_items
  for each row execute function set_owned_centroid();

create trigger service_requests_centroid
  before insert or update of geom on service_requests
  for each row execute function set_owned_centroid();

create trigger notification_registrations_centroid
  before insert or update of geom on notification_registrations
  for each row execute function set_owned_centroid();

create trigger weather_sources_centroid
  before insert or update of geom on weather_sources
  for each row execute function set_owned_centroid();

-- migrate:down

drop trigger if exists addresses_centroid on addresses;
drop trigger if exists regions_centroid on regions;
drop trigger if exists traps_centroid on traps;
drop trigger if exists collections_centroid on collections;
drop trigger if exists habitats_centroid on habitats;
drop trigger if exists inspections_centroid on inspections;
drop trigger if exists applications_centroid on applications;
drop trigger if exists source_reductions_centroid on source_reductions;
drop trigger if exists outreach_actions_centroid on outreach_actions;
drop trigger if exists biocontrol_actions_centroid on biocontrol_actions;
drop trigger if exists requested_control_actions_centroid on requested_control_actions;
drop trigger if exists mission_items_centroid on mission_items;
drop trigger if exists service_requests_centroid on service_requests;
drop trigger if exists notification_registrations_centroid on notification_registrations;
drop trigger if exists weather_sources_centroid on weather_sources;

drop function if exists set_owned_centroid();

alter table addresses
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table regions
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table traps
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table collections
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table habitats
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table inspections
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table applications
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table source_reductions
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table outreach_actions
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table biocontrol_actions
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table requested_control_actions
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table mission_items
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table service_requests
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table notification_registrations
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;

alter table weather_sources
  drop column lat,
  drop column lng,
  drop column geom_type,
  add column lat double precision generated always as (st_y(st_centroid(geom))) stored,
  add column lng double precision generated always as (st_x(st_centroid(geom))) stored,
  add column geom_type text generated always as (lower(st_geometrytype(geom))) stored;
