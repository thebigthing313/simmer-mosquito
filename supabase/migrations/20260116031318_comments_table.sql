
  create table "public"."comments" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "object_type" text not null,
    "object_id" uuid not null,
    "comment_text" text not null,
    "parent_id" uuid,
    "is_pinned" boolean default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."comments" enable row level security;

CREATE UNIQUE INDEX comments_pkey ON public.comments USING btree (id);

alter table "public"."comments" add constraint "comments_pkey" PRIMARY KEY using index "comments_pkey";

alter table "public"."comments" add constraint "comments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_created_by_fkey";

alter table "public"."comments" add constraint "comments_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_group_id_fkey";

alter table "public"."comments" add constraint "comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_parent_id_fkey";

alter table "public"."comments" add constraint "comments_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_updated_by_fkey";

grant delete on table "public"."comments" to "anon";

grant insert on table "public"."comments" to "anon";

grant references on table "public"."comments" to "anon";

grant select on table "public"."comments" to "anon";

grant trigger on table "public"."comments" to "anon";

grant truncate on table "public"."comments" to "anon";

grant update on table "public"."comments" to "anon";

grant delete on table "public"."comments" to "authenticated";

grant insert on table "public"."comments" to "authenticated";

grant references on table "public"."comments" to "authenticated";

grant select on table "public"."comments" to "authenticated";

grant trigger on table "public"."comments" to "authenticated";

grant truncate on table "public"."comments" to "authenticated";

grant update on table "public"."comments" to "authenticated";

grant delete on table "public"."comments" to "service_role";

grant insert on table "public"."comments" to "service_role";

grant references on table "public"."comments" to "service_role";

grant select on table "public"."comments" to "service_role";

grant trigger on table "public"."comments" to "service_role";

grant truncate on table "public"."comments" to "service_role";

grant update on table "public"."comments" to "service_role";


  create policy "delete: group managers or record creators"
  on "public"."comments"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));



  create policy "insert: group members"
  on "public"."comments"
  as permissive
  for insert
  to authenticated
with check (public.user_is_group_member(group_id));



  create policy "select: group members"
  on "public"."comments"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group managers or record creators"
  on "public"."comments"
  as permissive
  for update
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.comments FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


