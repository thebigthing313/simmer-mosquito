
  create table "public"."trap_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "trap_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."trap_tags" enable row level security;

CREATE UNIQUE INDEX trap_tags_pkey ON public.trap_tags USING btree (id);

CREATE UNIQUE INDEX trap_tags_unique ON public.trap_tags USING btree (trap_id, tag_id);

alter table "public"."trap_tags" add constraint "trap_tags_pkey" PRIMARY KEY using index "trap_tags_pkey";

alter table "public"."trap_tags" add constraint "trap_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_created_by_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_group_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE RESTRICT not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_tag_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_trap_id_fkey" FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON DELETE RESTRICT not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_trap_id_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_unique" UNIQUE using index "trap_tags_unique";

alter table "public"."trap_tags" add constraint "trap_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_updated_by_fkey";

grant delete on table "public"."trap_tags" to "anon";

grant insert on table "public"."trap_tags" to "anon";

grant references on table "public"."trap_tags" to "anon";

grant select on table "public"."trap_tags" to "anon";

grant trigger on table "public"."trap_tags" to "anon";

grant truncate on table "public"."trap_tags" to "anon";

grant update on table "public"."trap_tags" to "anon";

grant delete on table "public"."trap_tags" to "authenticated";

grant insert on table "public"."trap_tags" to "authenticated";

grant references on table "public"."trap_tags" to "authenticated";

grant select on table "public"."trap_tags" to "authenticated";

grant trigger on table "public"."trap_tags" to "authenticated";

grant truncate on table "public"."trap_tags" to "authenticated";

grant update on table "public"."trap_tags" to "authenticated";

grant delete on table "public"."trap_tags" to "service_role";

grant insert on table "public"."trap_tags" to "service_role";

grant references on table "public"."trap_tags" to "service_role";

grant select on table "public"."trap_tags" to "service_role";

grant trigger on table "public"."trap_tags" to "service_role";

grant truncate on table "public"."trap_tags" to "service_role";

grant update on table "public"."trap_tags" to "service_role";


  create policy "delete: own groups collectors"
  on "public"."trap_tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 4));



  create policy "insert: own groups collectors"
  on "public"."trap_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: group members"
  on "public"."trap_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collectors"
  on "public"."trap_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.trap_tags FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.trap_tags FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.trap_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


