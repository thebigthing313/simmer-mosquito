-- migrate:up
create extension if not exists postgis;

create table spatial_features (
  id uuid primary key default gen_random_uuid(),
  geom geometry(Geometry, 4326) not null,
  precision_policy text not null default 'preserve',
  source text,
  lat double precision generated always as (st_y(st_centroid(geom))) stored,
  lng double precision generated always as (st_x(st_centroid(geom))) stored,
  geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  geom_type text generated always as (lower(st_geometrytype(geom))) stored,
  created_at timestamptz not null default now(),
  constraint spatial_features_precision_policy_check
    check (precision_policy in ('preserve', 'snap_5_decimal'))
);

create unique index spatial_features_geom_hash_unique
  on spatial_features (md5(st_asbinary(geom)));

create index spatial_features_geom_gist_idx
  on spatial_features using gist (geom);

create or replace function get_or_create_spatial_feature(
  p_geojson jsonb,
  p_precision_policy text default 'preserve',
  p_source text default null
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

  if p_precision_policy = 'snap_5_decimal' then
    v_geom := st_snaptogrid(v_geom, 0.00001);
  end if;

  if not st_isvalid(v_geom) then
    raise exception 'get_or_create_spatial_feature: invalid geometry.';
  end if;

  v_hash := md5(st_asbinary(v_geom));

  insert into spatial_features (geom, precision_policy, source)
  values (v_geom, p_precision_policy, p_source)
  on conflict (md5(st_asbinary(geom))) do nothing;

  select id into v_feature_id
  from spatial_features
  where md5(st_asbinary(geom)) = v_hash;

  return v_feature_id;
end;
$$;

create table addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  display_name text not null,
  country char(2) not null,
  address_line_1 text,
  address_line_2 text,
  locality text,
  region text,
  postal_code text,
  geocoder_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index addresses_organization_display_name_idx
  on addresses (organization_id, display_name)
  where deleted_at is null;

create index addresses_organization_feature_idx
  on addresses (organization_id, feature_id)
  where deleted_at is null;

create index addresses_country_idx
  on addresses (country);

create table region_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index region_folders_organization_name_unique
  on region_folders (organization_id, name)
  where deleted_at is null;

create index region_folders_organization_sort_idx
  on region_folders (organization_id, sort_order, name)
  where deleted_at is null;

create table regions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  region_folder_id uuid references region_folders(id) on delete set null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  name text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index regions_organization_name_unique
  on regions (organization_id, name)
  where deleted_at is null;

create index regions_organization_name_idx
  on regions (organization_id, name)
  where deleted_at is null;

create index regions_organization_folder_idx
  on regions (organization_id, region_folder_id)
  where deleted_at is null;

create index regions_feature_idx
  on regions (feature_id)
  where deleted_at is null;

-- migrate:down
drop table if exists regions;
drop table if exists region_folders;
drop table if exists addresses;
drop function if exists get_or_create_spatial_feature(jsonb, text);
drop function if exists get_or_create_spatial_feature(jsonb, text, text);
drop table if exists spatial_features;
