create type "public"."insecticide_type" as enum ('larvicide', 'adulticide', 'pupicide', 'other');


  create table "public"."applications" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "insecticide_id" uuid not null,
    "application_date" date not null,
    "amount_applied" numeric(10,2) not null,
    "application_unit_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."applications" enable row level security;

alter table "public"."insecticides" add column "type" public.insecticide_type not null;

CREATE UNIQUE INDEX applications_pkey ON public.applications USING btree (id);

alter table "public"."applications" add constraint "applications_pkey" PRIMARY KEY using index "applications_pkey";

alter table "public"."applications" add constraint "applications_application_unit_id_fkey" FOREIGN KEY (application_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_application_unit_id_fkey";

alter table "public"."applications" add constraint "applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_created_by_fkey";

alter table "public"."applications" add constraint "applications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_group_id_fkey";

alter table "public"."applications" add constraint "applications_insecticide_id_fkey" FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_insecticide_id_fkey";

alter table "public"."applications" add constraint "applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_updated_by_fkey";

grant delete on table "public"."applications" to "anon";

grant insert on table "public"."applications" to "anon";

grant references on table "public"."applications" to "anon";

grant select on table "public"."applications" to "anon";

grant trigger on table "public"."applications" to "anon";

grant truncate on table "public"."applications" to "anon";

grant update on table "public"."applications" to "anon";

grant delete on table "public"."applications" to "authenticated";

grant insert on table "public"."applications" to "authenticated";

grant references on table "public"."applications" to "authenticated";

grant select on table "public"."applications" to "authenticated";

grant trigger on table "public"."applications" to "authenticated";

grant truncate on table "public"."applications" to "authenticated";

grant update on table "public"."applications" to "authenticated";

grant delete on table "public"."applications" to "service_role";

grant insert on table "public"."applications" to "service_role";

grant references on table "public"."applications" to "service_role";

grant select on table "public"."applications" to "service_role";

grant trigger on table "public"."applications" to "service_role";

grant truncate on table "public"."applications" to "service_role";

grant update on table "public"."applications" to "service_role";


  create policy "delete: own group manager or own records"
  on "public"."applications"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."applications"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."applications"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."applications"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.applications FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.applications FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


