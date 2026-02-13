--- rename from truck_ulvs to areawide_adulticiding

-- drop generated column geom from truck_ulvs
alter table "public"."truck_ulvs" drop column if exists "geom";

--- drop existing triggers
drop trigger if exists "set_audit_fields" on "public"."truck_ulvs";
drop trigger if exists "soft_delete_trigger" on "public"."truck_ulvs";

---- drop existing RLS policies
drop policy "delete: own group manager or own records" on "public"."truck_ulvs";
drop policy "insert: own group collector" on "public"."truck_ulvs";
drop policy "select: own groups" on "public"."truck_ulvs";
drop policy "update: own group collector" on "public"."truck_ulvs";

--- revoke premissions all on truck_ulvs
revoke delete on table "public"."truck_ulvs" from "anon";
revoke insert on table "public"."truck_ulvs" from "anon";
revoke references on table "public"."truck_ulvs" from "anon";
revoke select on table "public"."truck_ulvs" from "anon";
revoke trigger on table "public"."truck_ulvs" from "anon";
revoke truncate on table "public"."truck_ulvs" from "anon";
revoke update on table "public"."truck_ulvs" from "anon";
revoke delete on table "public"."truck_ulvs" from "authenticated";
revoke insert on table "public"."truck_ulvs" from "authenticated";
revoke references on table "public"."truck_ulvs" from "authenticated";
revoke select on table "public"."truck_ulvs" from "authenticated";
revoke trigger on table "public"."truck_ulvs" from "authenticated";
revoke truncate on table "public"."truck_ulvs" from "authenticated";
revoke update on table "public"."truck_ulvs" from "authenticated";
revoke delete on table "public"."truck_ulvs" from "service_role";
revoke insert on table "public"."truck_ulvs" from "service_role";
revoke references on table "public"."truck_ulvs" from "service_role";
revoke select on table "public"."truck_ulvs" from "service_role";
revoke trigger on table "public"."truck_ulvs" from "service_role";
revoke truncate on table "public"."truck_ulvs" from "service_role";
revoke update on table "public"."truck_ulvs" from "service_role";

--drop constraints on applications
alter table "public"."applications" drop constraint "applications_truck_ulv_id_fkey";
alter table "public"."applications" drop constraint "one_originating_table";

-- drop constraints on truck_ulvs
alter table "public"."truck_ulvs" drop constraint "temperature_unit";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_created_by_fkey";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_group_id_fkey";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_temperature_unit_id_fkey";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_updated_by_fkey";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_vehicle_id_fkey";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_wind_speed_unit_id_fkey";
alter table "public"."truck_ulvs" drop constraint "valid_time_range";
alter table "public"."truck_ulvs" drop constraint "wind_speed_unit";
alter table "public"."truck_ulvs" drop constraint "truck_ulvs_pkey";

--- drop indexes
drop index if exists "public"."truck_ulvs_pkey";
drop index if exists "public"."idx_truck_ulvs_geom";


---RENAME TABLE
alter table "public"."truck_ulvs" rename to "areawide_adulticiding";

--RENAME FIELD on applications
alter table "public"."applications" rename column "truck_ulv_id" to "areawide_adulticiding_id";

---reinstate constraints
CREATE UNIQUE INDEX areawide_adulticiding_pkey ON public.areawide_adulticiding USING btree (id);
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_pkey" PRIMARY KEY using index "areawide_adulticiding_pkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_created_by_fkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_group_id_fkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_temperature_unit_id_fkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_updated_by_fkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_vehicle_id_fkey";
alter table "public"."areawide_adulticiding" add constraint "areawide_adulticiding_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;
alter table "public"."areawide_adulticiding" validate constraint "areawide_adulticiding_wind_speed_unit_id_fkey";
alter table "public"."areawide_adulticiding" add constraint "temperature_unit" CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))) not valid;
alter table "public"."areawide_adulticiding" validate constraint "temperature_unit";
alter table "public"."areawide_adulticiding" add constraint "valid_time_range" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time))) not valid;
alter table "public"."areawide_adulticiding" validate constraint "valid_time_range";
alter table "public"."areawide_adulticiding" add constraint "wind_speed_unit" CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))) not valid;
alter table "public"."areawide_adulticiding" validate constraint "wind_speed_unit";

--Reinstate constraints on applications
alter table "public"."applications" add constraint "applications_areawide_adulticiding_id_fkey" FOREIGN KEY (areawide_adulticiding_id) REFERENCES public.areawide_adulticiding(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
alter table "public"."applications" validate constraint "applications_areawide_adulticiding_id_fkey";
alter table "public"."applications" add constraint "one_originating_table" CHECK (
        (flight_aerial_site_id is not null)::int +
        (catch_basin_mission_id is not null)::int +
        (areawide_adulticiding_id is not null)::int +
        (hand_ulv_id is not null)::int +
        (point_larviciding_id is not null)::int
        = 1
) not valid;
alter table "public"."applications" validate constraint "one_originating_table";

--- reinstate RLS policies
alter table "public"."areawide_adulticiding" enable row level security;

create policy "delete: own group manager or own records"
  on "public"."areawide_adulticiding"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));

create policy "insert: own group collector"
  on "public"."areawide_adulticiding"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "select: own groups"
  on "public"."areawide_adulticiding"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));

create policy "update: own group collector"
  on "public"."areawide_adulticiding"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


--reinstate permissions
grant delete on table "public"."areawide_adulticiding" to "anon";
grant insert on table "public"."areawide_adulticiding" to "anon";
grant references on table "public"."areawide_adulticiding" to "anon";
grant select on table "public"."areawide_adulticiding" to "anon";
grant trigger on table "public"."areawide_adulticiding" to "anon";
grant truncate on table "public"."areawide_adulticiding" to "anon";
grant update on table "public"."areawide_adulticiding" to "anon";
grant delete on table "public"."areawide_adulticiding" to "authenticated";
grant insert on table "public"."areawide_adulticiding" to "authenticated";
grant references on table "public"."areawide_adulticiding" to "authenticated";
grant select on table "public"."areawide_adulticiding" to "authenticated";
grant trigger on table "public"."areawide_adulticiding" to "authenticated";
grant truncate on table "public"."areawide_adulticiding" to "authenticated";
grant update on table "public"."areawide_adulticiding" to "authenticated";
grant delete on table "public"."areawide_adulticiding" to "service_role";
grant insert on table "public"."areawide_adulticiding" to "service_role";
grant references on table "public"."areawide_adulticiding" to "service_role";
grant select on table "public"."areawide_adulticiding" to "service_role";
grant trigger on table "public"."areawide_adulticiding" to "service_role";
grant truncate on table "public"."areawide_adulticiding" to "service_role";
grant update on table "public"."areawide_adulticiding" to "service_role";

-- reinstate triggers
CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.areawide_adulticiding FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();
CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.areawide_adulticiding FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

--readd generated column geom
alter table "public"."areawide_adulticiding" add column "geom" geometry(MultiPolygon, 4326) generated always as (
    extensions.ST_CollectionExtract(
        extensions.ST_Multi(
            extensions.ST_MakeValid(
                extensions.ST_Force2D(
                    extensions.ST_GeomFromGeoJSON(
                        case 
                            when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                            else geojson::text 
                        end
                    )
                )
            )
        ), 3)
) stored;

--reinstate indexes

CREATE INDEX idx_areawide_adulticiding_geom ON public.areawide_adulticiding USING gist (geom);