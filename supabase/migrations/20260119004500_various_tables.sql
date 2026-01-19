create type "public"."adulticide_mission_method_enum" as enum ('ground', 'aerial');

create type "public"."adulticide_mission_status_enum" as enum ('planned', 'completed', 'canceled');


  create table "public"."adulticide_missions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "mission_date" date not null,
    "adulticide_id" uuid not null,
    "rain_date" date,
    "completed_date" date,
    "method" public.adulticide_mission_method_enum not null,
    "description" text not null,
    "status" public.adulticide_mission_status_enum not null default 'planned'::public.adulticide_mission_status_enum,
    "geom" extensions.geometry(MultiPolygon,4326) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."adulticide_missions" enable row level security;


  create table "public"."insecticides" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "name" text not null,
    "active_ingredient" text not null,
    "epa_registration_number" text not null,
    "default_usage_unit_id" uuid not null,
    "label_url" text,
    "msds_url" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."insecticides" enable row level security;


  create table "public"."mission_subdivisions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "mission_id" uuid not null,
    "geom" extensions.geometry(Polygon,4326) not null
      );


alter table "public"."mission_subdivisions" enable row level security;


  create table "public"."service_requests" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "complainant_id" uuid not null,
    "complainant_location_id" uuid,
    "complaint_location_id" uuid not null,
    "request_date" date not null,
    "complaint_details" text not null,
    "is_closed" boolean not null default false,
    "closing_date" date,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."service_requests" enable row level security;

CREATE UNIQUE INDEX adulticide_missions_pkey ON public.adulticide_missions USING btree (id);

CREATE INDEX idx_adulticide_missions_geom ON public.adulticide_missions USING gist (geom);

CREATE INDEX idx_mission_subdivisions_geom ON public.mission_subdivisions USING gist (geom);

CREATE UNIQUE INDEX insecticide_name_unique ON public.insecticides USING btree (group_id, name);

CREATE UNIQUE INDEX insecticides_pkey ON public.insecticides USING btree (id);

CREATE UNIQUE INDEX mission_subdivisions_pkey ON public.mission_subdivisions USING btree (id);

CREATE UNIQUE INDEX service_requests_pkey ON public.service_requests USING btree (id);

alter table "public"."adulticide_missions" add constraint "adulticide_missions_pkey" PRIMARY KEY using index "adulticide_missions_pkey";

alter table "public"."insecticides" add constraint "insecticides_pkey" PRIMARY KEY using index "insecticides_pkey";

alter table "public"."mission_subdivisions" add constraint "mission_subdivisions_pkey" PRIMARY KEY using index "mission_subdivisions_pkey";

alter table "public"."service_requests" add constraint "service_requests_pkey" PRIMARY KEY using index "service_requests_pkey";

alter table "public"."adulticide_missions" add constraint "adulticide_missions_adulticide_id_fkey" FOREIGN KEY (adulticide_id) REFERENCES public.insecticides(id) ON DELETE RESTRICT not valid;

alter table "public"."adulticide_missions" validate constraint "adulticide_missions_adulticide_id_fkey";

alter table "public"."adulticide_missions" add constraint "adulticide_missions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."adulticide_missions" validate constraint "adulticide_missions_created_by_fkey";

alter table "public"."adulticide_missions" add constraint "adulticide_missions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."adulticide_missions" validate constraint "adulticide_missions_group_id_fkey";

alter table "public"."adulticide_missions" add constraint "adulticide_missions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."adulticide_missions" validate constraint "adulticide_missions_updated_by_fkey";

alter table "public"."insecticides" add constraint "insecticide_name_unique" UNIQUE using index "insecticide_name_unique";

alter table "public"."insecticides" add constraint "insecticides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."insecticides" validate constraint "insecticides_created_by_fkey";

alter table "public"."insecticides" add constraint "insecticides_default_usage_unit_id_fkey" FOREIGN KEY (default_usage_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT not valid;

alter table "public"."insecticides" validate constraint "insecticides_default_usage_unit_id_fkey";

alter table "public"."insecticides" add constraint "insecticides_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."insecticides" validate constraint "insecticides_group_id_fkey";

alter table "public"."insecticides" add constraint "insecticides_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."insecticides" validate constraint "insecticides_updated_by_fkey";

alter table "public"."mission_subdivisions" add constraint "mission_subdivisions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."mission_subdivisions" validate constraint "mission_subdivisions_group_id_fkey";

alter table "public"."mission_subdivisions" add constraint "mission_subdivisions_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES public.adulticide_missions(id) ON DELETE CASCADE not valid;

alter table "public"."mission_subdivisions" validate constraint "mission_subdivisions_mission_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_complainant_id_fkey" FOREIGN KEY (complainant_id) REFERENCES public.contacts(id) ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_complainant_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_complainant_location_id_fkey" FOREIGN KEY (complainant_location_id) REFERENCES public.locations(id) ON DELETE SET NULL not valid;

alter table "public"."service_requests" validate constraint "service_requests_complainant_location_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_complaint_location_id_fkey" FOREIGN KEY (complaint_location_id) REFERENCES public.locations(id) ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_complaint_location_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."service_requests" validate constraint "service_requests_created_by_fkey";

alter table "public"."service_requests" add constraint "service_requests_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_group_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."service_requests" validate constraint "service_requests_updated_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION simmer.refresh_mission_subdivisions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    begin
        -- 1. If this is an update, delete existing first
        if (TG_OP = 'UPDATE') then
            delete from public.mission_subdivisions
            where mission_id = OLD.id;
        end if;

        -- 2. check against null geometry
        if (NEW.geom is null) then
            return NEW;
        end if;

        -- 3. Insert new subdivisions. Adjust vertices if not performant enough.
        insert into public.mission_subdivisions (mission_id, geom)
        select NEW.id,
        (extensions.ST_Subdivide(extensions.ST_MakeValid(NEW.geom), 128))::geometry(Polygon, 4326);

        return NEW;
    end;
$function$
;

grant delete on table "public"."adulticide_missions" to "anon";

grant insert on table "public"."adulticide_missions" to "anon";

grant references on table "public"."adulticide_missions" to "anon";

grant select on table "public"."adulticide_missions" to "anon";

grant trigger on table "public"."adulticide_missions" to "anon";

grant truncate on table "public"."adulticide_missions" to "anon";

grant update on table "public"."adulticide_missions" to "anon";

grant delete on table "public"."adulticide_missions" to "authenticated";

grant insert on table "public"."adulticide_missions" to "authenticated";

grant references on table "public"."adulticide_missions" to "authenticated";

grant select on table "public"."adulticide_missions" to "authenticated";

grant trigger on table "public"."adulticide_missions" to "authenticated";

grant truncate on table "public"."adulticide_missions" to "authenticated";

grant update on table "public"."adulticide_missions" to "authenticated";

grant delete on table "public"."adulticide_missions" to "service_role";

grant insert on table "public"."adulticide_missions" to "service_role";

grant references on table "public"."adulticide_missions" to "service_role";

grant select on table "public"."adulticide_missions" to "service_role";

grant trigger on table "public"."adulticide_missions" to "service_role";

grant truncate on table "public"."adulticide_missions" to "service_role";

grant update on table "public"."adulticide_missions" to "service_role";

grant delete on table "public"."insecticides" to "anon";

grant insert on table "public"."insecticides" to "anon";

grant references on table "public"."insecticides" to "anon";

grant select on table "public"."insecticides" to "anon";

grant trigger on table "public"."insecticides" to "anon";

grant truncate on table "public"."insecticides" to "anon";

grant update on table "public"."insecticides" to "anon";

grant delete on table "public"."insecticides" to "authenticated";

grant insert on table "public"."insecticides" to "authenticated";

grant references on table "public"."insecticides" to "authenticated";

grant select on table "public"."insecticides" to "authenticated";

grant trigger on table "public"."insecticides" to "authenticated";

grant truncate on table "public"."insecticides" to "authenticated";

grant update on table "public"."insecticides" to "authenticated";

grant delete on table "public"."insecticides" to "service_role";

grant insert on table "public"."insecticides" to "service_role";

grant references on table "public"."insecticides" to "service_role";

grant select on table "public"."insecticides" to "service_role";

grant trigger on table "public"."insecticides" to "service_role";

grant truncate on table "public"."insecticides" to "service_role";

grant update on table "public"."insecticides" to "service_role";

grant delete on table "public"."mission_subdivisions" to "anon";

grant insert on table "public"."mission_subdivisions" to "anon";

grant references on table "public"."mission_subdivisions" to "anon";

grant select on table "public"."mission_subdivisions" to "anon";

grant trigger on table "public"."mission_subdivisions" to "anon";

grant truncate on table "public"."mission_subdivisions" to "anon";

grant update on table "public"."mission_subdivisions" to "anon";

grant delete on table "public"."mission_subdivisions" to "authenticated";

grant insert on table "public"."mission_subdivisions" to "authenticated";

grant references on table "public"."mission_subdivisions" to "authenticated";

grant select on table "public"."mission_subdivisions" to "authenticated";

grant trigger on table "public"."mission_subdivisions" to "authenticated";

grant truncate on table "public"."mission_subdivisions" to "authenticated";

grant update on table "public"."mission_subdivisions" to "authenticated";

grant delete on table "public"."mission_subdivisions" to "service_role";

grant insert on table "public"."mission_subdivisions" to "service_role";

grant references on table "public"."mission_subdivisions" to "service_role";

grant select on table "public"."mission_subdivisions" to "service_role";

grant trigger on table "public"."mission_subdivisions" to "service_role";

grant truncate on table "public"."mission_subdivisions" to "service_role";

grant update on table "public"."mission_subdivisions" to "service_role";

grant delete on table "public"."service_requests" to "anon";

grant insert on table "public"."service_requests" to "anon";

grant references on table "public"."service_requests" to "anon";

grant select on table "public"."service_requests" to "anon";

grant trigger on table "public"."service_requests" to "anon";

grant truncate on table "public"."service_requests" to "anon";

grant update on table "public"."service_requests" to "anon";

grant delete on table "public"."service_requests" to "authenticated";

grant insert on table "public"."service_requests" to "authenticated";

grant references on table "public"."service_requests" to "authenticated";

grant select on table "public"."service_requests" to "authenticated";

grant trigger on table "public"."service_requests" to "authenticated";

grant truncate on table "public"."service_requests" to "authenticated";

grant update on table "public"."service_requests" to "authenticated";

grant delete on table "public"."service_requests" to "service_role";

grant insert on table "public"."service_requests" to "service_role";

grant references on table "public"."service_requests" to "service_role";

grant select on table "public"."service_requests" to "service_role";

grant trigger on table "public"."service_requests" to "service_role";

grant truncate on table "public"."service_requests" to "service_role";

grant update on table "public"."service_requests" to "service_role";


  create policy "delete: own group manager"
  on "public"."adulticide_missions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."adulticide_missions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."adulticide_missions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."adulticide_missions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group admin"
  on "public"."insecticides"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."insecticides"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."insecticides"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group admin"
  on "public"."insecticides"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group manager"
  on "public"."mission_subdivisions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."mission_subdivisions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups"
  on "public"."mission_subdivisions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."mission_subdivisions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."service_requests"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."service_requests"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."service_requests"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."service_requests"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.adulticide_missions FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.adulticide_missions FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER refresh_mission_subdivisions_trigger AFTER INSERT OR UPDATE OF geom ON public.adulticide_missions FOR EACH ROW EXECUTE FUNCTION simmer.refresh_mission_subdivisions();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.adulticide_missions FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.insecticides FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.insecticides FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.insecticides FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


