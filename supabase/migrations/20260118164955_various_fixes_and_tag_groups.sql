drop policy "delete: group manager" on "public"."regions";

drop policy "insert: group manager" on "public"."regions";

drop policy "update: group manager" on "public"."regions";

drop policy "delete: own group manager" on "public"."tags";

drop policy "insert: own group manager" on "public"."tags";

drop policy "update: own group manager" on "public"."tags";

alter table "public"."habitat_tags" drop constraint "habitat_tags_habitat_id_fkey";

alter table "public"."habitat_tags" drop constraint "habitat_tags_tag_id_fkey";

alter table "public"."locations" drop constraint "locations_group_id_fkey";

alter table "public"."regions" drop constraint "regions_group_id_fkey";

alter table "public"."tags" drop constraint "name_unique";

drop index if exists "public"."name_unique";


  create table "public"."tag_groups" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."tag_groups" enable row level security;

alter table "public"."region_subdivisions" add column "group_id" uuid not null;

alter table "public"."region_subdivisions" enable row level security;

alter table "public"."tags" add column "tag_group_id" uuid;

CREATE UNIQUE INDEX tag_groups_pkey ON public.tag_groups USING btree (id);

CREATE UNIQUE INDEX name_unique ON public.tags USING btree (group_id, tag_group_id, name);

alter table "public"."tag_groups" add constraint "tag_groups_pkey" PRIMARY KEY using index "tag_groups_pkey";

alter table "public"."region_subdivisions" add constraint "region_subdivisions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."region_subdivisions" validate constraint "region_subdivisions_group_id_fkey";

alter table "public"."tag_groups" add constraint "tag_groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."tag_groups" validate constraint "tag_groups_created_by_fkey";

alter table "public"."tag_groups" add constraint "tag_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."tag_groups" validate constraint "tag_groups_group_id_fkey";

alter table "public"."tag_groups" add constraint "tag_groups_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."tag_groups" validate constraint "tag_groups_updated_by_fkey";

alter table "public"."tags" add constraint "tags_tag_group_id_fkey" FOREIGN KEY (tag_group_id) REFERENCES public.tag_groups(id) ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_tag_group_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE CASCADE not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_habitat_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_tag_id_fkey";

alter table "public"."locations" add constraint "locations_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."locations" validate constraint "locations_group_id_fkey";

alter table "public"."regions" add constraint "regions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."regions" validate constraint "regions_group_id_fkey";

alter table "public"."tags" add constraint "name_unique" UNIQUE using index "name_unique";

grant delete on table "public"."tag_groups" to "anon";

grant insert on table "public"."tag_groups" to "anon";

grant references on table "public"."tag_groups" to "anon";

grant select on table "public"."tag_groups" to "anon";

grant trigger on table "public"."tag_groups" to "anon";

grant truncate on table "public"."tag_groups" to "anon";

grant update on table "public"."tag_groups" to "anon";

grant delete on table "public"."tag_groups" to "authenticated";

grant insert on table "public"."tag_groups" to "authenticated";

grant references on table "public"."tag_groups" to "authenticated";

grant select on table "public"."tag_groups" to "authenticated";

grant trigger on table "public"."tag_groups" to "authenticated";

grant truncate on table "public"."tag_groups" to "authenticated";

grant update on table "public"."tag_groups" to "authenticated";

grant delete on table "public"."tag_groups" to "service_role";

grant insert on table "public"."tag_groups" to "service_role";

grant references on table "public"."tag_groups" to "service_role";

grant select on table "public"."tag_groups" to "service_role";

grant trigger on table "public"."tag_groups" to "service_role";

grant truncate on table "public"."tag_groups" to "service_role";

grant update on table "public"."tag_groups" to "service_role";


  create policy "delete: own group admin"
  on "public"."region_subdivisions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."region_subdivisions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."region_subdivisions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group admin"
  on "public"."region_subdivisions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: group admin"
  on "public"."regions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: group admin"
  on "public"."regions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "update: group admin"
  on "public"."regions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group admin"
  on "public"."tag_groups"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."tag_groups"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups or group_id is null"
  on "public"."tag_groups"
  as permissive
  for select
  to authenticated
using ((public.user_is_group_member(group_id) OR (group_id IS NULL)));



  create policy "update: own group admin"
  on "public"."tag_groups"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group admin"
  on "public"."tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "update: own group admin"
  on "public"."tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.tag_groups FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.tag_groups FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.tag_groups FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


