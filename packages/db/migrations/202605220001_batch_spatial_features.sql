-- migrate:up

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
    id := get_or_create_spatial_feature(
      v_geojson,
      v_precision_policy
    );

    return next;
  end loop;
end;
$$;

comment on function get_or_create_spatial_features(jsonb)
  is 'Bulk get/create helper for up to 1000 spatial feature inputs. Returns one row per input with zero-based input_index and spatial_features.id.';

-- migrate:down

drop function if exists get_or_create_spatial_features(jsonb);
