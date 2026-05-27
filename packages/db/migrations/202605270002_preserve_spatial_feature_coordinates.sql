-- migrate:up

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

-- migrate:down

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
