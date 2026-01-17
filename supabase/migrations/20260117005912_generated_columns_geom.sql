drop trigger if exists "handle_updated_trigger" on "public"."locations";

drop trigger if exists "handle_updated_trigger" on "public"."traps";

alter table "public"."locations" drop column "geom";

alter table "public"."locations" add column "lat" double precision not null;

alter table "public"."locations" add column "lng" double precision not null;

alter table "public"."locations" add column "geom" extensions.geometry(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored;

alter table "public"."traps" drop column "geom";

alter table "public"."traps" add column "lat" double precision not null;

alter table "public"."traps" add column "lng" double precision not null;

alter table "public"."traps" add column "geom" extensions.geometry(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored;

CREATE INDEX idx_locations_geom ON public.locations USING gist (geom);

CREATE INDEX idx_traps_geom ON public.traps USING gist (geom);

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.traps FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();


