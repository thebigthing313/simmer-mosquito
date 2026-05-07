-- migrate:up
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

-- migrate:down
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
