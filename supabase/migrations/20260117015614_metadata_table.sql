
  create table "public"."metadata" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "object_type" text not null,
    "object_id" uuid not null,
    "metadata" jsonb not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."metadata" enable row level security;

CREATE UNIQUE INDEX metadata_pkey ON public.metadata USING btree (id);

alter table "public"."metadata" add constraint "metadata_pkey" PRIMARY KEY using index "metadata_pkey";

alter table "public"."metadata" add constraint "metadata_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."metadata" validate constraint "metadata_created_by_fkey";

alter table "public"."metadata" add constraint "metadata_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."metadata" validate constraint "metadata_group_id_fkey";

alter table "public"."metadata" add constraint "metadata_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."metadata" validate constraint "metadata_updated_by_fkey";

grant delete on table "public"."metadata" to "anon";

grant insert on table "public"."metadata" to "anon";

grant references on table "public"."metadata" to "anon";

grant select on table "public"."metadata" to "anon";

grant trigger on table "public"."metadata" to "anon";

grant truncate on table "public"."metadata" to "anon";

grant update on table "public"."metadata" to "anon";

grant delete on table "public"."metadata" to "authenticated";

grant insert on table "public"."metadata" to "authenticated";

grant references on table "public"."metadata" to "authenticated";

grant select on table "public"."metadata" to "authenticated";

grant trigger on table "public"."metadata" to "authenticated";

grant truncate on table "public"."metadata" to "authenticated";

grant update on table "public"."metadata" to "authenticated";

grant delete on table "public"."metadata" to "service_role";

grant insert on table "public"."metadata" to "service_role";

grant references on table "public"."metadata" to "service_role";

grant select on table "public"."metadata" to "service_role";

grant trigger on table "public"."metadata" to "service_role";

grant truncate on table "public"."metadata" to "service_role";

grant update on table "public"."metadata" to "service_role";


  create policy "delete: group managers or record creators"
  on "public"."metadata"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));



  create policy "insert: group members"
  on "public"."metadata"
  as permissive
  for insert
  to authenticated
with check (public.user_is_group_member(group_id));



  create policy "select: group members"
  on "public"."metadata"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group managers or record creators"
  on "public"."metadata"
  as permissive
  for update
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR ((created_by = ( SELECT auth.uid() AS uid)) AND public.user_is_group_member(group_id))));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.metadata FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.metadata FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.metadata FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


