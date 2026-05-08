-- migrate:up

-- Source: 202605060004_core_gis.sql
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

-- Source: 202605060005_reference_taxonomy_and_lookups.sql
create table genera (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique,
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table species (
  id uuid primary key default gen_random_uuid(),
  genus_id uuid references genera(id) on delete restrict,
  epithet text not null,
  common_name text,
  display_name text not null,
  is_special boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (genus_id, epithet)
);

create unique index species_special_epithet_unique
  on species (epithet)
  where genus_id is null;

create table organization_species (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  species_id uuid not null references species(id) on delete restrict,
  display_name_override text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, species_id)
);

create index organization_species_org_active_sort_idx
  on organization_species (organization_id, is_active, sort_order);

create table collection_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index collection_methods_org_name_unique
  on collection_methods (organization_id, name)
  where deleted_at is null;

create index collection_methods_org_active_sort_idx
  on collection_methods (organization_id, is_active, sort_order)
  where deleted_at is null;

create table collection_lures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index collection_lures_org_name_unique
  on collection_lures (organization_id, name)
  where deleted_at is null;

create index collection_lures_org_active_sort_idx
  on collection_lures (organization_id, is_active, sort_order)
  where deleted_at is null;

create table habitat_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index habitat_types_org_name_unique
  on habitat_types (organization_id, name)
  where deleted_at is null;

create index habitat_types_org_active_sort_idx
  on habitat_types (organization_id, is_active, sort_order)
  where deleted_at is null;

-- Source: 202605060006_remove_unstructured_metadata.sql
drop function if exists get_or_create_spatial_feature(jsonb, text, text, jsonb);

alter table spatial_features
  drop column if exists metadata;

alter table addresses
  drop column if exists metadata;

alter table region_folders
  drop column if exists metadata;

alter table genera
  drop column if exists metadata;

alter table species
  drop column if exists metadata;

alter table organization_species
  drop column if exists metadata;

alter table collection_methods
  drop column if exists metadata;

alter table collection_lures
  drop column if exists metadata;

alter table habitat_types
  drop column if exists metadata;

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

-- Source: 202605060007_simplify_foundation_schema.sql
alter table users
  drop column if exists profile_picture_url;

alter table organizations
  add column main_contact_email text,
  add column phone_number text,
  add column country char(2),
  add column address_line_1 text,
  add column address_line_2 text,
  add column locality text,
  add column region text,
  add column postal_code text;

drop function if exists get_or_create_spatial_feature(jsonb, text, text);

alter table spatial_features
  drop constraint if exists spatial_features_precision_policy_check,
  drop column if exists precision_policy,
  drop column if exists source;

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

  if p_precision_policy = 'snap_5_decimal' then
    v_geom := st_snaptogrid(v_geom, 0.00001);
  end if;

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

drop index if exists region_folders_organization_sort_idx;

alter table region_folders
  drop column if exists sort_order;

drop index if exists organization_species_org_active_sort_idx;

alter table species
  drop column if exists is_special;

alter table organization_species
  drop column if exists display_name_override,
  drop column if exists is_active,
  drop column if exists sort_order;

create index organization_species_org_idx
  on organization_species (organization_id);

drop index if exists collection_methods_org_active_sort_idx;
drop index if exists collection_lures_org_active_sort_idx;
drop index if exists habitat_types_org_active_sort_idx;

alter table collection_methods
  drop column if exists sort_order;

alter table collection_lures
  drop column if exists sort_order;

alter table habitat_types
  drop column if exists sort_order;

create index collection_methods_org_active_name_idx
  on collection_methods (organization_id, is_active, name)
  where deleted_at is null;

create index collection_lures_org_active_name_idx
  on collection_lures (organization_id, is_active, name)
  where deleted_at is null;

create index habitat_types_org_active_name_idx
  on habitat_types (organization_id, is_active, name)
  where deleted_at is null;

-- Source: 202605060008_org_audit_and_mailing_address.sql
alter table organizations
  rename column country to mailing_country;

alter table organizations
  rename column address_line_1 to mailing_address_line_1;

alter table organizations
  rename column address_line_2 to mailing_address_line_2;

alter table organizations
  rename column locality to mailing_locality;

alter table organizations
  rename column region to mailing_region;

alter table organizations
  rename column postal_code to mailing_postal_code;

alter table addresses
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table region_folders
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table regions
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table organization_species
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table collection_methods
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table collection_lures
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table habitat_types
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

-- Source: 202605060027_spatial_feature_regions.sql
create table spatial_feature_regions (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references spatial_features(id) on delete cascade,
  region_folder_id uuid not null references region_folders(id) on delete cascade,
  intersected_region_ids uuid[] not null,
  cached_at timestamptz not null default now()
);

create unique index spatial_feature_regions_feature_folder_unique
  on spatial_feature_regions (feature_id, region_folder_id);

create index spatial_feature_regions_region_folder_idx
  on spatial_feature_regions (region_folder_id);

-- migrate:down

-- Source: 202605060027_spatial_feature_regions.sql
drop table if exists spatial_feature_regions;

-- Source: 202605060008_org_audit_and_mailing_address.sql
alter table habitat_types
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table collection_lures
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table collection_methods
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table organization_species
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table regions
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table region_folders
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table addresses
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table organizations
  rename column mailing_country to country;

alter table organizations
  rename column mailing_address_line_1 to address_line_1;

alter table organizations
  rename column mailing_address_line_2 to address_line_2;

alter table organizations
  rename column mailing_locality to locality;

alter table organizations
  rename column mailing_region to region;

alter table organizations
  rename column mailing_postal_code to postal_code;

-- Source: 202605060007_simplify_foundation_schema.sql
drop index if exists habitat_types_org_active_name_idx;
drop index if exists collection_lures_org_active_name_idx;
drop index if exists collection_methods_org_active_name_idx;

alter table habitat_types
  add column if not exists sort_order integer not null default 0;

alter table collection_lures
  add column if not exists sort_order integer not null default 0;

alter table collection_methods
  add column if not exists sort_order integer not null default 0;

create index collection_methods_org_active_sort_idx
  on collection_methods (organization_id, is_active, sort_order)
  where deleted_at is null;

create index collection_lures_org_active_sort_idx
  on collection_lures (organization_id, is_active, sort_order)
  where deleted_at is null;

create index habitat_types_org_active_sort_idx
  on habitat_types (organization_id, is_active, sort_order)
  where deleted_at is null;

drop index if exists organization_species_org_idx;

alter table organization_species
  add column if not exists display_name_override text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0;

alter table species
  add column if not exists is_special boolean not null default false;

create index organization_species_org_active_sort_idx
  on organization_species (organization_id, is_active, sort_order);

alter table region_folders
  add column if not exists sort_order integer not null default 0;

create index region_folders_organization_sort_idx
  on region_folders (organization_id, sort_order, name)
  where deleted_at is null;

drop function if exists get_or_create_spatial_feature(jsonb, text);

alter table spatial_features
  add column if not exists precision_policy text not null default 'preserve',
  add column if not exists source text,
  add constraint spatial_features_precision_policy_check
    check (precision_policy in ('preserve', 'snap_5_decimal'));

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

alter table organizations
  drop column if exists postal_code,
  drop column if exists region,
  drop column if exists locality,
  drop column if exists address_line_2,
  drop column if exists address_line_1,
  drop column if exists country,
  drop column if exists phone_number,
  drop column if exists main_contact_email;

alter table users
  add column if not exists profile_picture_url text;

-- Source: 202605060006_remove_unstructured_metadata.sql
drop function if exists get_or_create_spatial_feature(jsonb, text, text);

alter table spatial_features
  add column if not exists metadata jsonb;

alter table addresses
  add column if not exists metadata jsonb;

alter table region_folders
  add column if not exists metadata jsonb;

alter table genera
  add column if not exists metadata jsonb;

alter table species
  add column if not exists metadata jsonb;

alter table organization_species
  add column if not exists metadata jsonb;

alter table collection_methods
  add column if not exists metadata jsonb;

alter table collection_lures
  add column if not exists metadata jsonb;

alter table habitat_types
  add column if not exists metadata jsonb;

create or replace function get_or_create_spatial_feature(
  p_geojson jsonb,
  p_precision_policy text default 'preserve',
  p_source text default null,
  p_metadata jsonb default null
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

  insert into spatial_features (geom, precision_policy, source, metadata)
  values (v_geom, p_precision_policy, p_source, p_metadata)
  on conflict (md5(st_asbinary(geom))) do nothing;

  select id into v_feature_id
  from spatial_features
  where md5(st_asbinary(geom)) = v_hash;

  return v_feature_id;
end;
$$;

-- Source: 202605060005_reference_taxonomy_and_lookups.sql
drop table if exists habitat_types;
drop table if exists collection_lures;
drop table if exists collection_methods;
drop table if exists organization_species;
drop table if exists species;
drop table if exists genera;

-- Source: 202605060004_core_gis.sql
drop table if exists regions;
drop table if exists region_folders;
drop table if exists addresses;
drop function if exists get_or_create_spatial_feature(jsonb, text);
drop function if exists get_or_create_spatial_feature(jsonb, text, text);
drop table if exists spatial_features;

