
  create table "public"."regions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "region_name" text not null,
    "geom" extensions.geometry(MultiPolygon,4326) not null,
    "parent_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."regions" enable row level security;

CREATE UNIQUE INDEX regions_pkey ON public.regions USING btree (id);

alter table "public"."regions" add constraint "regions_pkey" PRIMARY KEY using index "regions_pkey";

alter table "public"."regions" add constraint "regions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_created_by_fkey";

alter table "public"."regions" add constraint "regions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE not valid;

alter table "public"."regions" validate constraint "regions_group_id_fkey";

alter table "public"."regions" add constraint "regions_parent_check" CHECK ((id <> parent_id)) not valid;

alter table "public"."regions" validate constraint "regions_parent_check";

alter table "public"."regions" add constraint "regions_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.regions(id) ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_parent_id_fkey";

alter table "public"."regions" add constraint "regions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_updated_by_fkey";

grant delete on table "public"."regions" to "anon";

grant insert on table "public"."regions" to "anon";

grant references on table "public"."regions" to "anon";

grant select on table "public"."regions" to "anon";

grant trigger on table "public"."regions" to "anon";

grant truncate on table "public"."regions" to "anon";

grant update on table "public"."regions" to "anon";

grant delete on table "public"."regions" to "authenticated";

grant insert on table "public"."regions" to "authenticated";

grant references on table "public"."regions" to "authenticated";

grant select on table "public"."regions" to "authenticated";

grant trigger on table "public"."regions" to "authenticated";

grant truncate on table "public"."regions" to "authenticated";

grant update on table "public"."regions" to "authenticated";

grant delete on table "public"."regions" to "service_role";

grant insert on table "public"."regions" to "service_role";

grant references on table "public"."regions" to "service_role";

grant select on table "public"."regions" to "service_role";

grant trigger on table "public"."regions" to "service_role";

grant truncate on table "public"."regions" to "service_role";

grant update on table "public"."regions" to "service_role";


  create policy "delete: group manager"
  on "public"."regions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: group manager"
  on "public"."regions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: group data"
  on "public"."regions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group manager"
  on "public"."regions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.regions FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.regions FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.regions FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


