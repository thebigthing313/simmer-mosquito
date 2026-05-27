-- migrate:up

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
drop function if exists get_or_create_spatial_features(jsonb);
drop function if exists get_or_create_spatial_feature(jsonb, text);
drop function if exists get_or_create_spatial_feature(jsonb, text, text);
drop function if exists get_or_create_spatial_feature(jsonb, text, text, jsonb);

drop table if exists spatial_feature_regions;

drop index if exists weather_sources_feature_idx;
drop index if exists notification_registrations_feature_idx;
drop index if exists service_requests_feature_idx;
drop index if exists mission_items_feature_idx;
drop index if exists requested_control_actions_feature_idx;
drop index if exists biocontrol_actions_feature_idx;
drop index if exists outreach_actions_feature_idx;
drop index if exists source_reductions_feature_idx;
drop index if exists applications_feature_idx;
drop index if exists inspections_feature_idx;
drop index if exists habitats_feature_idx;
drop index if exists collections_feature_idx;
drop index if exists traps_feature_idx;
drop index if exists regions_feature_idx;
drop index if exists addresses_organization_feature_idx;

alter table weather_sources drop column if exists feature_id;
alter table notification_registrations drop column if exists feature_id;
alter table service_requests drop column if exists feature_id;
alter table mission_items drop column if exists feature_id;
alter table requested_control_actions drop column if exists feature_id;
alter table biocontrol_actions drop column if exists feature_id;
alter table outreach_actions drop column if exists feature_id;
alter table source_reductions drop column if exists feature_id;
alter table applications drop column if exists feature_id;
alter table inspections drop column if exists feature_id;
alter table habitats drop column if exists feature_id;
alter table collections drop column if exists feature_id;
alter table traps drop column if exists feature_id;
alter table regions drop column if exists feature_id;
alter table addresses drop column if exists feature_id;

drop table if exists spatial_features;

-- migrate:down

create table spatial_features (
  id uuid primary key default gen_random_uuid(),
  geom geometry(Geometry, 4326) not null,
  lat double precision generated always as (st_y(st_centroid(geom))) stored,
  lng double precision generated always as (st_x(st_centroid(geom))) stored,
  geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  created_at timestamptz not null default now()
);

create unique index spatial_features_geom_hash_unique
  on spatial_features (md5(st_asbinary(geom)));

create index spatial_features_geom_gist_idx
  on spatial_features using gist (geom);

insert into spatial_features (geom)
select distinct geom
from (
  select geom from addresses
  union all select geom from regions
  union all select geom from traps
  union all select geom from collections
  union all select geom from habitats
  union all select geom from inspections
  union all select geom from applications
  union all select geom from source_reductions
  union all select geom from outreach_actions
  union all select geom from biocontrol_actions
  union all select geom from requested_control_actions
  union all select geom from mission_items
  union all select geom from service_requests
  union all select geom from notification_registrations
  union all select geom from weather_sources
) as owned_geometry;

alter table addresses add column feature_id uuid;
alter table regions add column feature_id uuid;
alter table traps add column feature_id uuid;
alter table collections add column feature_id uuid;
alter table habitats add column feature_id uuid;
alter table inspections add column feature_id uuid;
alter table applications add column feature_id uuid;
alter table source_reductions add column feature_id uuid;
alter table outreach_actions add column feature_id uuid;
alter table biocontrol_actions add column feature_id uuid;
alter table requested_control_actions add column feature_id uuid;
alter table mission_items add column feature_id uuid;
alter table service_requests add column feature_id uuid;
alter table notification_registrations add column feature_id uuid;
alter table weather_sources add column feature_id uuid;

update addresses
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(addresses.geom)) = md5(st_asbinary(spatial_features.geom));

update regions
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(regions.geom)) = md5(st_asbinary(spatial_features.geom));

update traps
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(traps.geom)) = md5(st_asbinary(spatial_features.geom));

update collections
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(collections.geom)) = md5(st_asbinary(spatial_features.geom));

update habitats
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(habitats.geom)) = md5(st_asbinary(spatial_features.geom));

update inspections
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(inspections.geom)) = md5(st_asbinary(spatial_features.geom));

update applications
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(applications.geom)) = md5(st_asbinary(spatial_features.geom));

update source_reductions
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(source_reductions.geom)) = md5(st_asbinary(spatial_features.geom));

update outreach_actions
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(outreach_actions.geom)) = md5(st_asbinary(spatial_features.geom));

update biocontrol_actions
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(biocontrol_actions.geom)) = md5(st_asbinary(spatial_features.geom));

update requested_control_actions
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(requested_control_actions.geom)) = md5(st_asbinary(spatial_features.geom));

update mission_items
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(mission_items.geom)) = md5(st_asbinary(spatial_features.geom));

update service_requests
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(service_requests.geom)) = md5(st_asbinary(spatial_features.geom));

update notification_registrations
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(notification_registrations.geom)) = md5(st_asbinary(spatial_features.geom));

update weather_sources
set feature_id = spatial_features.id
from spatial_features
where md5(st_asbinary(weather_sources.geom)) = md5(st_asbinary(spatial_features.geom));

alter table addresses
  alter column feature_id set not null,
  add constraint addresses_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table regions
  alter column feature_id set not null,
  add constraint regions_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table traps
  alter column feature_id set not null,
  add constraint traps_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table collections
  alter column feature_id set not null,
  add constraint collections_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table habitats
  alter column feature_id set not null,
  add constraint habitats_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table inspections
  alter column feature_id set not null,
  add constraint inspections_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table applications
  alter column feature_id set not null,
  add constraint applications_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table source_reductions
  alter column feature_id set not null,
  add constraint source_reductions_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table outreach_actions
  alter column feature_id set not null,
  add constraint outreach_actions_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table biocontrol_actions
  alter column feature_id set not null,
  add constraint biocontrol_actions_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table requested_control_actions
  alter column feature_id set not null,
  add constraint requested_control_actions_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table mission_items
  alter column feature_id set not null,
  add constraint mission_items_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table service_requests
  alter column feature_id set not null,
  add constraint service_requests_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table notification_registrations
  alter column feature_id set not null,
  add constraint notification_registrations_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

alter table weather_sources
  alter column feature_id set not null,
  add constraint weather_sources_feature_id_fkey
    foreign key (feature_id) references spatial_features(id) on delete restrict;

create index addresses_organization_feature_idx
  on addresses (organization_id, feature_id)
  where deleted_at is null;

create index regions_feature_idx
  on regions (feature_id)
  where deleted_at is null;

create index traps_feature_idx
  on traps (feature_id)
  where deleted_at is null;

create index collections_feature_idx
  on collections (feature_id)
  where deleted_at is null;

create index habitats_feature_idx
  on habitats (feature_id)
  where deleted_at is null;

create index inspections_feature_idx
  on inspections (feature_id)
  where deleted_at is null;

create index applications_feature_idx
  on applications (feature_id)
  where deleted_at is null;

create index source_reductions_feature_idx
  on source_reductions (feature_id)
  where deleted_at is null;

create index outreach_actions_feature_idx
  on outreach_actions (feature_id)
  where deleted_at is null;

create index biocontrol_actions_feature_idx
  on biocontrol_actions (feature_id)
  where deleted_at is null;

create index requested_control_actions_feature_idx
  on requested_control_actions (feature_id)
  where deleted_at is null;

create index mission_items_feature_idx
  on mission_items (feature_id)
  where deleted_at is null;

create index service_requests_feature_idx
  on service_requests (feature_id)
  where deleted_at is null;

create index notification_registrations_feature_idx
  on notification_registrations (feature_id)
  where deleted_at is null;

create index weather_sources_feature_idx
  on weather_sources (feature_id)
  where deleted_at is null;

create table spatial_feature_regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete cascade,
  region_folder_id uuid not null references region_folders(id) on delete cascade,
  intersected_region_ids uuid[] not null,
  cached_at timestamptz not null default now()
);

create unique index spatial_feature_regions_feature_folder_unique
  on spatial_feature_regions (feature_id, region_folder_id);

create index spatial_feature_regions_region_folder_idx
  on spatial_feature_regions (region_folder_id);

create index spatial_feature_regions_organization_feature_idx
  on spatial_feature_regions (organization_id, feature_id);

create or replace function get_or_create_spatial_feature(
  p_geojson jsonb,
  p_precision_policy text default 'preserve'
) returns uuid
language plpgsql
as $$
declare
  v_geom geometry(Geometry, 4326);
  v_hash text;
  v_feature_id uuid;
begin
  if p_geojson is null then
    raise exception 'get_or_create_spatial_feature: p_geojson is required.';
  end if;

  if p_precision_policy not in ('preserve', 'snap_5_decimal') then
    raise exception 'get_or_create_spatial_feature: invalid precision policy %.', p_precision_policy;
  end if;

  v_geom := st_force2d(
    st_setsrid(
      st_geomfromgeojson(
        case
          when (p_geojson -> 'geometry') is not null
            then (p_geojson -> 'geometry')::text
          else p_geojson::text
        end
      ),
      4326
    )
  );

  if not st_isvalid(v_geom) then
    raise exception 'get_or_create_spatial_feature: invalid geometry.';
  end if;

  v_hash := md5(st_asbinary(v_geom));

  insert into spatial_features (geom)
  values (v_geom)
  on conflict (md5(st_asbinary(geom))) do nothing;

  select id into v_feature_id
  from spatial_features
  where md5(st_asbinary(geom)) = v_hash;

  return v_feature_id;
end;
$$;

create or replace function get_or_create_spatial_features(
  p_features jsonb
) returns table (
  input_index integer,
  id uuid
)
language plpgsql
as $$
declare
  v_count integer;
  v_item jsonb;
  v_geojson jsonb;
  v_precision_policy text;
  v_ordinality bigint;
begin
  if p_features is null then
    raise exception 'get_or_create_spatial_features: p_features is required.';
  end if;

  if jsonb_typeof(p_features) <> 'array' then
    raise exception 'get_or_create_spatial_features: p_features must be a JSON array.';
  end if;

  v_count := jsonb_array_length(p_features);

  if v_count > 1000 then
    raise exception 'get_or_create_spatial_features: batch size % exceeds maximum of 1000.', v_count;
  end if;

  for v_item, v_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_features) with ordinality
  loop
    v_geojson := coalesce(v_item -> 'geojson', v_item -> 'geometry', v_item);
    v_precision_policy := coalesce(
      nullif(v_item ->> 'precisionPolicy', ''),
      nullif(v_item ->> 'precision_policy', ''),
      'preserve'
    );

    input_index := (v_ordinality - 1)::integer;
    id := get_or_create_spatial_feature(v_geojson, v_precision_policy);

    return next;
  end loop;
end;
$$;

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
