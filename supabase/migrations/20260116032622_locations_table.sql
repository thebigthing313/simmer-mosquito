
  create table "public"."locations" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "location_name" text not null,
    "address" text,
    "geom" extensions.geometry(Point,4326) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."locations" enable row level security;

CREATE UNIQUE INDEX locations_pkey ON public.locations USING btree (id);

alter table "public"."locations" add constraint "locations_pkey" PRIMARY KEY using index "locations_pkey";

alter table "public"."locations" add constraint "locations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."locations" validate constraint "locations_created_by_fkey";

alter table "public"."locations" add constraint "locations_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) not valid;

alter table "public"."locations" validate constraint "locations_group_id_fkey";

alter table "public"."locations" add constraint "locations_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."locations" validate constraint "locations_updated_by_fkey";

grant delete on table "public"."locations" to "anon";

grant insert on table "public"."locations" to "anon";

grant references on table "public"."locations" to "anon";

grant select on table "public"."locations" to "anon";

grant trigger on table "public"."locations" to "anon";

grant truncate on table "public"."locations" to "anon";

grant update on table "public"."locations" to "anon";

grant delete on table "public"."locations" to "authenticated";

grant insert on table "public"."locations" to "authenticated";

grant references on table "public"."locations" to "authenticated";

grant select on table "public"."locations" to "authenticated";

grant trigger on table "public"."locations" to "authenticated";

grant truncate on table "public"."locations" to "authenticated";

grant update on table "public"."locations" to "authenticated";

grant delete on table "public"."locations" to "service_role";

grant insert on table "public"."locations" to "service_role";

grant references on table "public"."locations" to "service_role";

grant select on table "public"."locations" to "service_role";

grant trigger on table "public"."locations" to "service_role";

grant truncate on table "public"."locations" to "service_role";

grant update on table "public"."locations" to "service_role";


  create policy "delete: own if collector, all if manager"
  on "public"."locations"
  as permissive
  for delete
  to authenticated
using (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)));



  create policy "insert: group collectors"
  on "public"."locations"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: group data"
  on "public"."locations"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own if collector, all if manager"
  on "public"."locations"
  as permissive
  for update
  to authenticated
using (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)))
with check (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.locations FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.locations FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.locations FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


