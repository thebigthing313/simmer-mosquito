create type "public"."aerial_result_type" as enum ('recheck', 'fly', 'hand treat', 'no action');

drop trigger if exists "set_audit_fields" on "public"."ulv_missions";

drop trigger if exists "soft_delete_trigger" on "public"."ulv_missions";

drop policy "delete: own group manager" on "public"."ulv_missions";

drop policy "insert: own group manager" on "public"."ulv_missions";

drop policy "select: own groups or group_id is null" on "public"."ulv_missions";

drop policy "update: own group manager" on "public"."ulv_missions";

revoke delete on table "public"."ulv_missions" from "anon";

revoke insert on table "public"."ulv_missions" from "anon";

revoke references on table "public"."ulv_missions" from "anon";

revoke select on table "public"."ulv_missions" from "anon";

revoke trigger on table "public"."ulv_missions" from "anon";

revoke truncate on table "public"."ulv_missions" from "anon";

revoke update on table "public"."ulv_missions" from "anon";

revoke delete on table "public"."ulv_missions" from "authenticated";

revoke insert on table "public"."ulv_missions" from "authenticated";

revoke references on table "public"."ulv_missions" from "authenticated";

revoke select on table "public"."ulv_missions" from "authenticated";

revoke trigger on table "public"."ulv_missions" from "authenticated";

revoke truncate on table "public"."ulv_missions" from "authenticated";

revoke update on table "public"."ulv_missions" from "authenticated";

revoke delete on table "public"."ulv_missions" from "service_role";

revoke insert on table "public"."ulv_missions" from "service_role";

revoke references on table "public"."ulv_missions" from "service_role";

revoke select on table "public"."ulv_missions" from "service_role";

revoke trigger on table "public"."ulv_missions" from "service_role";

revoke truncate on table "public"."ulv_missions" from "service_role";

revoke update on table "public"."ulv_missions" from "service_role";

alter table "public"."trap_lures" drop constraint "trap_lures_lure_name_key";

alter table "public"."ulv_missions" drop constraint "completion_date_after_mission_date";

alter table "public"."ulv_missions" drop constraint "rain_date_after_mission_date";

alter table "public"."ulv_missions" drop constraint "ulv_missions_created_by_fkey";

alter table "public"."ulv_missions" drop constraint "ulv_missions_feature_id_fkey";

alter table "public"."ulv_missions" drop constraint "ulv_missions_group_id_fkey";

alter table "public"."ulv_missions" drop constraint "ulv_missions_updated_by_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_aerial_inspection_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_application_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_flight_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_inspection_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_personnel_id_fkey";

alter table "public"."address_tags" drop constraint "address_tags_address_id_fkey";

alter table "public"."address_tags" drop constraint "address_tags_tag_id_fkey";

alter table "public"."route_items" drop constraint "route_items_habitat_id_fkey";

alter table "public"."route_items" drop constraint "route_items_route_id_fkey";

alter table "public"."trap_tags" drop constraint "trap_tags_group_id_fkey";

alter table "public"."trap_tags" drop constraint "trap_tags_tag_id_fkey";

alter table "public"."trap_tags" drop constraint "trap_tags_trap_id_fkey";

alter table "public"."ulv_missions" drop constraint "ulv_missions_pkey";

drop index if exists "public"."trap_lures_lure_name_key";

drop index if exists "public"."ulv_missions_pkey";

drop table "public"."ulv_missions";


  create table "public"."scheduled_missions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "rain_date" date,
    "is_cancelled" boolean not null default false,
    "area_description" text,
    "completion_date" date,
    "feature_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."scheduled_missions" enable row level security;

alter table "public"."aerial_inspections" alter column "result" set data type public.aerial_result_type using "result"::text::public.aerial_result_type;

alter table "public"."collections" alter column "collection_date" set not null;

alter table "public"."collections" alter column "has_error" set not null;

alter table "public"."habitats" drop column "is_permanent";

alter table "public"."regions" alter column "group_id" set not null;

alter table "public"."trap_types" alter column "group_id" set not null;

drop type "public"."aerial_inspection_result";

CREATE UNIQUE INDEX lure_name_unique ON public.trap_lures USING btree (group_id, lure_name);

CREATE UNIQUE INDEX scheduled_missions_pkey ON public.scheduled_missions USING btree (id);

CREATE UNIQUE INDEX trap_type_name_unique ON public.trap_types USING btree (group_id, trap_type_name);

alter table "public"."scheduled_missions" add constraint "scheduled_missions_pkey" PRIMARY KEY using index "scheduled_missions_pkey";

alter table "public"."inspections" add constraint "inspections_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_habitat_id_fkey";

alter table "public"."scheduled_missions" add constraint "scheduled_missions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."scheduled_missions" validate constraint "scheduled_missions_created_by_fkey";

alter table "public"."scheduled_missions" add constraint "scheduled_missions_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."scheduled_missions" validate constraint "scheduled_missions_feature_id_fkey";

alter table "public"."scheduled_missions" add constraint "scheduled_missions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."scheduled_missions" validate constraint "scheduled_missions_group_id_fkey";

alter table "public"."scheduled_missions" add constraint "scheduled_missions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."scheduled_missions" validate constraint "scheduled_missions_updated_by_fkey";

alter table "public"."trap_lures" add constraint "lure_name_unique" UNIQUE using index "lure_name_unique";

alter table "public"."trap_types" add constraint "trap_type_name_unique" UNIQUE using index "trap_type_name_unique";

alter table "public"."additional_personnel" add constraint "additional_personnel_aerial_inspection_id_fkey" FOREIGN KEY (aerial_inspection_id) REFERENCES public.aerial_inspections(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_aerial_inspection_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_application_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_flight_id_fkey" FOREIGN KEY (flight_id) REFERENCES public.flights(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_flight_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_inspection_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_personnel_id_fkey" FOREIGN KEY (personnel_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_personnel_id_fkey";

alter table "public"."address_tags" add constraint "address_tags_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."address_tags" validate constraint "address_tags_address_id_fkey";

alter table "public"."address_tags" add constraint "address_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."address_tags" validate constraint "address_tags_tag_id_fkey";

alter table "public"."route_items" add constraint "route_items_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."route_items" validate constraint "route_items_habitat_id_fkey";

alter table "public"."route_items" add constraint "route_items_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.routes(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."route_items" validate constraint "route_items_route_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_group_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_tag_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_trap_id_fkey" FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_trap_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_or_create_spatial_feature(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_geojson jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

grant delete on table "public"."scheduled_missions" to "anon";

grant insert on table "public"."scheduled_missions" to "anon";

grant references on table "public"."scheduled_missions" to "anon";

grant select on table "public"."scheduled_missions" to "anon";

grant trigger on table "public"."scheduled_missions" to "anon";

grant truncate on table "public"."scheduled_missions" to "anon";

grant update on table "public"."scheduled_missions" to "anon";

grant delete on table "public"."scheduled_missions" to "authenticated";

grant insert on table "public"."scheduled_missions" to "authenticated";

grant references on table "public"."scheduled_missions" to "authenticated";

grant select on table "public"."scheduled_missions" to "authenticated";

grant trigger on table "public"."scheduled_missions" to "authenticated";

grant truncate on table "public"."scheduled_missions" to "authenticated";

grant update on table "public"."scheduled_missions" to "authenticated";

grant delete on table "public"."scheduled_missions" to "service_role";

grant insert on table "public"."scheduled_missions" to "service_role";

grant references on table "public"."scheduled_missions" to "service_role";

grant select on table "public"."scheduled_missions" to "service_role";

grant trigger on table "public"."scheduled_missions" to "service_role";

grant truncate on table "public"."scheduled_missions" to "service_role";

grant update on table "public"."scheduled_missions" to "service_role";


  create policy "delete: own group manager"
  on "public"."scheduled_missions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."scheduled_missions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."scheduled_missions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."scheduled_missions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.scheduled_missions FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.scheduled_missions FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


comment on column public.applications.inspection_id is 'polymorphic';
comment on column public.applications.flight_aerial_site_id is 'polymorphic';
comment on column public.applications.catch_basin_mission_id is 'polymorphic';
comment on column public.applications.handheld_applications_id is 'polymorphic';
comment on column public.applications.truck_applications is 'polymorphic';

comment on column public.comments.trap_id is 'polymorphic';
comment on column public.comments.collection_id is 'polymorphic';
comment on column public.comments.landing_rate_id is 'polymorphic';
comment on column public.comments.service_request_id is 'polymorphic';
comment on column public.comments.contact_id is 'polymorphic';
comment on column public.comments.aerial_site_id is 'polymorphic';
comment on column public.comments.sample_id is 'polymorphic';
comment on column public.comments.notification_id is 'polymorphic';

comment on column public.additional_personnel.inspection_id is 'polymorphyic';
comment on column public.additional_personnel.aerial_inspection_id is 'polymorphyic';
comment on column public.additional_personnel.flight_id is 'polymorphyic';
comment on column public.additional_personnel.application_id is 'polymorphyic';

alter table public.applications
rename constraint applications_truck_applications_fkey to applications_truck_application_id_fkey;

alter table public.profiles
add column is_active boolean not null default true;

alter table public.route_items
add column directions_to_next_item text;

alter table public.trap_types
drop constraint trap_types_trap_type_name_key;

drop index if exists public."trap_types_trap_type_name_key";