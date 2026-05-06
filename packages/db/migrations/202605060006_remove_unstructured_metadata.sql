-- migrate:up
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

-- migrate:down
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
