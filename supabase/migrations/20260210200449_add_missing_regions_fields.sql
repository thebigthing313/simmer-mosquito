alter table "public"."regions" drop column "geom";

alter table "public"."regions" add column "geojson" jsonb not null;

alter table "public"."regions" add column "metadata" jsonb;

alter table "public"."regions" add column "name_path" text;

alter table "public"."regions" add column "geom" extensions.geometry(MultiPolygon,4326) generated always as (extensions.st_collectionextract(extensions.st_makevalid(extensions.st_geomfromgeojson((geojson)::text)), 3)) stored;


