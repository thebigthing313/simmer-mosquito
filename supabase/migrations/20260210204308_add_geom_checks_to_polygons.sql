drop index if exists idx_regions_geom;
drop index if exists idx_aerial_sites_geom;
drop index if exists idx_ulv_missions_geom;
drop index if exists idx_truck_ulvs_geom;
drop index if exists idx_catch_basin_missions_geom;

alter table public.regions drop column if exists geom;
alter table public.aerial_sites drop column if exists geom;
alter table public.ulv_missions drop column if exists geom;
alter table public.truck_ulvs drop column if exists geom;
alter table public.catch_basin_missions drop column if exists geom;

alter table public.regions add column geom geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_GeomFromGeoJSON(
                    case 
                        when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                        else geojson::text 
                    end
                )
            )
        ), 3)
) stored;

alter table public.aerial_sites add column geom geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_GeomFromGeoJSON(
                    case 
                        when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                        else geojson::text 
                    end
                )
            )
        ), 3)
) stored;

alter table public.ulv_missions add column geom geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_GeomFromGeoJSON(
                    case 
                        when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                        else geojson::text 
                    end
                )
            )
        ), 3)
) stored;

alter table public.truck_ulvs add column geom geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_GeomFromGeoJSON(
                    case 
                        when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                        else geojson::text 
                    end
                )
            )
        ), 3)
) stored;

alter table public.catch_basin_missions add column geom geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_GeomFromGeoJSON(
                    case 
                        when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                        else geojson::text 
                    end
                )
            )
        ), 3)
) stored;

create index idx_regions_geom on public.regions using gist (geom);
create index idx_aerial_sites_geom on public.aerial_sites using gist (geom);
create index idx_ulv_missions_geom on public.ulv_missions using GIST (geom);
create index idx_truck_ulvs_geom on public.truck_ulvs using GIST (geom);
create index idx_catch_basin_missions_geom on public.catch_basin_missions using GIST (geom);