CREATE OR REPLACE FUNCTION public.get_or_create_spatial_feature(
    p_lat double precision DEFAULT NULL,
    p_lng double precision DEFAULT NULL,
    p_geojson jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_geom extensions.geometry(Geometry, 4326);
    v_feature_id uuid;
    v_hash text;
BEGIN
    -- 1. Construct and FORCE TO 2D
    IF p_geojson IS NOT NULL THEN
        v_geom := extensions.ST_Force2D(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
            CASE 
                WHEN (p_geojson->'geometry') IS NOT NULL THEN (p_geojson->'geometry')::text 
                ELSE p_geojson::text 
            END
        ), 4326));
    ELSIF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_geom := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326);
    ELSE
        RAISE EXCEPTION 'Missing spatial input: Provide lat/lng or geojson.';
    END IF;

    -- 2. Enforcement: Snap to 6 decimals
    v_geom := extensions.ST_SnapToGrid(v_geom, 0.000001);
    v_hash := md5(extensions.ST_AsBinary(v_geom));

    -- 3. Atomic De-duplication using the HASH
    INSERT INTO public.spatial_features (geom)
    VALUES (v_geom)
    ON CONFLICT (md5(extensions.ST_AsBinary(geom))) DO NOTHING;

    -- 4. Return the ID
    SELECT id INTO v_feature_id 
    FROM public.spatial_features 
    WHERE md5(extensions.ST_AsBinary(geom)) = v_hash;

    RETURN v_feature_id;
END;
$$;