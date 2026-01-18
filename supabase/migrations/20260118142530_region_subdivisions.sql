
  create table "public"."region_subdivisions" (
    "id" uuid not null default gen_random_uuid(),
    "region_id" uuid not null,
    "geom" extensions.geometry(Polygon,4326) not null
      );


CREATE INDEX idx_region_subdivisions_geom ON public.region_subdivisions USING gist (geom);

CREATE UNIQUE INDEX region_subdivisions_pkey ON public.region_subdivisions USING btree (id);

alter table "public"."region_subdivisions" add constraint "region_subdivisions_pkey" PRIMARY KEY using index "region_subdivisions_pkey";

alter table "public"."region_subdivisions" add constraint "region_subdivisions_region_id_fkey" FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE not valid;

alter table "public"."region_subdivisions" validate constraint "region_subdivisions_region_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION simmer.refresh_region_subdivisions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    begin
        -- 1. If this is an update, delete existing first
        if (TG_OP = 'UPDATE') then
            delete from public.region_subdivisions
            where region_id = OLD.id;
        end if;

        -- 2. check against null geometry
        if (NEW.geom is null) then
            return NEW;
        end if;

        -- 3. Insert new subdivisions. Adjust vertices if not performant enough.
        insert into public.region_subdivisions (region_id, geom)
        select NEW.id,
        (extensions.ST_Subdivide(extensions.ST_MakeValid(NEW.geom), 128))::geometry(Polygon, 4326);

        return NEW;
    end;
$function$
;

grant delete on table "public"."region_subdivisions" to "anon";

grant insert on table "public"."region_subdivisions" to "anon";

grant references on table "public"."region_subdivisions" to "anon";

grant select on table "public"."region_subdivisions" to "anon";

grant trigger on table "public"."region_subdivisions" to "anon";

grant truncate on table "public"."region_subdivisions" to "anon";

grant update on table "public"."region_subdivisions" to "anon";

grant delete on table "public"."region_subdivisions" to "authenticated";

grant insert on table "public"."region_subdivisions" to "authenticated";

grant references on table "public"."region_subdivisions" to "authenticated";

grant select on table "public"."region_subdivisions" to "authenticated";

grant trigger on table "public"."region_subdivisions" to "authenticated";

grant truncate on table "public"."region_subdivisions" to "authenticated";

grant update on table "public"."region_subdivisions" to "authenticated";

grant delete on table "public"."region_subdivisions" to "service_role";

grant insert on table "public"."region_subdivisions" to "service_role";

grant references on table "public"."region_subdivisions" to "service_role";

grant select on table "public"."region_subdivisions" to "service_role";

grant trigger on table "public"."region_subdivisions" to "service_role";

grant truncate on table "public"."region_subdivisions" to "service_role";

grant update on table "public"."region_subdivisions" to "service_role";

CREATE TRIGGER refresh_region_subdivisions_trigger AFTER INSERT OR UPDATE OF geom ON public.regions FOR EACH ROW EXECUTE FUNCTION simmer.refresh_region_subdivisions();


