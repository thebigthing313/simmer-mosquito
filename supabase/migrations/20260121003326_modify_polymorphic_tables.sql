
  create table "public"."additional_personnel" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "profile_id" uuid not null,
    "inspection_id" uuid,
    "mission_applications_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."additional_personnel" enable row level security;


  create table "public"."mission_applications" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "adulticide_mission_id" uuid not null,
    "applicator_id" uuid not null,
    "started_at" timestamp with time zone not null,
    "ended_at" timestamp with time zone not null,
    "geom" extensions.geometry(MultiPolygon,4326) not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."mission_applications" enable row level security;

alter table "public"."applications" add column "inspection_id" uuid;

alter table "public"."applications" add column "mission_applications_id" uuid;

alter table "public"."comments" add column "adulticide_mission_id" uuid;

alter table "public"."comments" add column "collection_id" uuid;

alter table "public"."comments" add column "habitat_id" uuid;

alter table "public"."comments" add column "mission_applications_id" uuid;

alter table "public"."comments" add column "service_request_id" uuid;

CREATE UNIQUE INDEX additional_personnel_pkey ON public.additional_personnel USING btree (id);

CREATE INDEX idx_mission_applications_geom ON public.mission_applications USING gist (geom);

CREATE UNIQUE INDEX mission_applications_pkey ON public.mission_applications USING btree (id);

alter table "public"."additional_personnel" add constraint "additional_personnel_pkey" PRIMARY KEY using index "additional_personnel_pkey";

alter table "public"."mission_applications" add constraint "mission_applications_pkey" PRIMARY KEY using index "mission_applications_pkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_created_by_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_group_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_inspection_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_mission_applications_id_fkey" FOREIGN KEY (mission_applications_id) REFERENCES public.mission_applications(id) ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_mission_applications_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_profile_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_updated_by_fkey";

alter table "public"."applications" add constraint "applications_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_inspection_id_fkey";

alter table "public"."applications" add constraint "applications_mission_applications_id_fkey" FOREIGN KEY (mission_applications_id) REFERENCES public.mission_applications(id) ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_mission_applications_id_fkey";

alter table "public"."comments" add constraint "comments_adulticide_mission_id_fkey" FOREIGN KEY (adulticide_mission_id) REFERENCES public.adulticide_missions(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_adulticide_mission_id_fkey";

alter table "public"."comments" add constraint "comments_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_collection_id_fkey";

alter table "public"."comments" add constraint "comments_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_habitat_id_fkey";

alter table "public"."comments" add constraint "comments_mission_applications_id_fkey" FOREIGN KEY (mission_applications_id) REFERENCES public.mission_applications(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_mission_applications_id_fkey";

alter table "public"."comments" add constraint "comments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_service_request_id_fkey";

alter table "public"."mission_applications" add constraint "mission_applications_adulticide_mission_id_fkey" FOREIGN KEY (adulticide_mission_id) REFERENCES public.adulticide_missions(id) ON DELETE RESTRICT not valid;

alter table "public"."mission_applications" validate constraint "mission_applications_adulticide_mission_id_fkey";

alter table "public"."mission_applications" add constraint "mission_applications_applicator_id_fkey" FOREIGN KEY (applicator_id) REFERENCES public.profiles(id) ON DELETE RESTRICT not valid;

alter table "public"."mission_applications" validate constraint "mission_applications_applicator_id_fkey";

alter table "public"."mission_applications" add constraint "mission_applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."mission_applications" validate constraint "mission_applications_created_by_fkey";

alter table "public"."mission_applications" add constraint "mission_applications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."mission_applications" validate constraint "mission_applications_group_id_fkey";

alter table "public"."mission_applications" add constraint "mission_applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."mission_applications" validate constraint "mission_applications_updated_by_fkey";

grant delete on table "public"."additional_personnel" to "anon";

grant insert on table "public"."additional_personnel" to "anon";

grant references on table "public"."additional_personnel" to "anon";

grant select on table "public"."additional_personnel" to "anon";

grant trigger on table "public"."additional_personnel" to "anon";

grant truncate on table "public"."additional_personnel" to "anon";

grant update on table "public"."additional_personnel" to "anon";

grant delete on table "public"."additional_personnel" to "authenticated";

grant insert on table "public"."additional_personnel" to "authenticated";

grant references on table "public"."additional_personnel" to "authenticated";

grant select on table "public"."additional_personnel" to "authenticated";

grant trigger on table "public"."additional_personnel" to "authenticated";

grant truncate on table "public"."additional_personnel" to "authenticated";

grant update on table "public"."additional_personnel" to "authenticated";

grant delete on table "public"."additional_personnel" to "service_role";

grant insert on table "public"."additional_personnel" to "service_role";

grant references on table "public"."additional_personnel" to "service_role";

grant select on table "public"."additional_personnel" to "service_role";

grant trigger on table "public"."additional_personnel" to "service_role";

grant truncate on table "public"."additional_personnel" to "service_role";

grant update on table "public"."additional_personnel" to "service_role";

grant delete on table "public"."mission_applications" to "anon";

grant insert on table "public"."mission_applications" to "anon";

grant references on table "public"."mission_applications" to "anon";

grant select on table "public"."mission_applications" to "anon";

grant trigger on table "public"."mission_applications" to "anon";

grant truncate on table "public"."mission_applications" to "anon";

grant update on table "public"."mission_applications" to "anon";

grant delete on table "public"."mission_applications" to "authenticated";

grant insert on table "public"."mission_applications" to "authenticated";

grant references on table "public"."mission_applications" to "authenticated";

grant select on table "public"."mission_applications" to "authenticated";

grant trigger on table "public"."mission_applications" to "authenticated";

grant truncate on table "public"."mission_applications" to "authenticated";

grant update on table "public"."mission_applications" to "authenticated";

grant delete on table "public"."mission_applications" to "service_role";

grant insert on table "public"."mission_applications" to "service_role";

grant references on table "public"."mission_applications" to "service_role";

grant select on table "public"."mission_applications" to "service_role";

grant trigger on table "public"."mission_applications" to "service_role";

grant truncate on table "public"."mission_applications" to "service_role";

grant update on table "public"."mission_applications" to "service_role";


  create policy "delete: group managers or record creators"
  on "public"."additional_personnel"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));



  create policy "insert: group members"
  on "public"."additional_personnel"
  as permissive
  for insert
  to authenticated
with check (public.user_is_group_member(group_id));



  create policy "select: group members"
  on "public"."additional_personnel"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group managers or record creators"
  on "public"."additional_personnel"
  as permissive
  for update
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));



  create policy "delete: own group manager or own records"
  on "public"."mission_applications"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."mission_applications"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."mission_applications"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."mission_applications"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.additional_personnel FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.additional_personnel FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.additional_personnel FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.mission_applications FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.mission_applications FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.mission_applications FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


