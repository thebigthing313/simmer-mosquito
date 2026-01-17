
  create table "public"."trap_lures" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "lure_name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."trap_lures" enable row level security;


  create table "public"."trap_types" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid,
    "trap_type_name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."trap_types" enable row level security;


  create table "public"."traps" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "trap_type_id" uuid not null,
    "location_id" uuid,
    "geom" extensions.geometry(Point,4326) not null,
    "is_active" boolean not null default true,
    "is_permanent" boolean not null default false,
    "trap_name" text,
    "trap_code" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone,
    "updated_by" uuid
      );


alter table "public"."traps" enable row level security;

CREATE UNIQUE INDEX trap_lures_lure_name_key ON public.trap_lures USING btree (lure_name);

CREATE UNIQUE INDEX trap_lures_pkey ON public.trap_lures USING btree (id);

CREATE UNIQUE INDEX trap_types_pkey ON public.trap_types USING btree (id);

CREATE UNIQUE INDEX trap_types_trap_type_name_key ON public.trap_types USING btree (trap_type_name);

CREATE UNIQUE INDEX traps_pkey ON public.traps USING btree (id);

alter table "public"."trap_lures" add constraint "trap_lures_pkey" PRIMARY KEY using index "trap_lures_pkey";

alter table "public"."trap_types" add constraint "trap_types_pkey" PRIMARY KEY using index "trap_types_pkey";

alter table "public"."traps" add constraint "traps_pkey" PRIMARY KEY using index "traps_pkey";

alter table "public"."trap_lures" add constraint "trap_lures_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_created_by_fkey";

alter table "public"."trap_lures" add constraint "trap_lures_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_group_id_fkey";

alter table "public"."trap_lures" add constraint "trap_lures_lure_name_key" UNIQUE using index "trap_lures_lure_name_key";

alter table "public"."trap_lures" add constraint "trap_lures_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_updated_by_fkey";

alter table "public"."trap_types" add constraint "trap_types_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_types" validate constraint "trap_types_created_by_fkey";

alter table "public"."trap_types" add constraint "trap_types_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."trap_types" validate constraint "trap_types_group_id_fkey";

alter table "public"."trap_types" add constraint "trap_types_trap_type_name_key" UNIQUE using index "trap_types_trap_type_name_key";

alter table "public"."trap_types" add constraint "trap_types_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."trap_types" validate constraint "trap_types_updated_by_fkey";

alter table "public"."traps" add constraint "traps_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_created_by_fkey";

alter table "public"."traps" add constraint "traps_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_group_id_fkey";

alter table "public"."traps" add constraint "traps_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_location_id_fkey";

alter table "public"."traps" add constraint "traps_trap_type_id_fkey" FOREIGN KEY (trap_type_id) REFERENCES public.trap_types(id) ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_trap_type_id_fkey";

alter table "public"."traps" add constraint "traps_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_updated_by_fkey";

grant delete on table "public"."trap_lures" to "anon";

grant insert on table "public"."trap_lures" to "anon";

grant references on table "public"."trap_lures" to "anon";

grant select on table "public"."trap_lures" to "anon";

grant trigger on table "public"."trap_lures" to "anon";

grant truncate on table "public"."trap_lures" to "anon";

grant update on table "public"."trap_lures" to "anon";

grant delete on table "public"."trap_lures" to "authenticated";

grant insert on table "public"."trap_lures" to "authenticated";

grant references on table "public"."trap_lures" to "authenticated";

grant select on table "public"."trap_lures" to "authenticated";

grant trigger on table "public"."trap_lures" to "authenticated";

grant truncate on table "public"."trap_lures" to "authenticated";

grant update on table "public"."trap_lures" to "authenticated";

grant delete on table "public"."trap_lures" to "service_role";

grant insert on table "public"."trap_lures" to "service_role";

grant references on table "public"."trap_lures" to "service_role";

grant select on table "public"."trap_lures" to "service_role";

grant trigger on table "public"."trap_lures" to "service_role";

grant truncate on table "public"."trap_lures" to "service_role";

grant update on table "public"."trap_lures" to "service_role";

grant delete on table "public"."trap_types" to "anon";

grant insert on table "public"."trap_types" to "anon";

grant references on table "public"."trap_types" to "anon";

grant select on table "public"."trap_types" to "anon";

grant trigger on table "public"."trap_types" to "anon";

grant truncate on table "public"."trap_types" to "anon";

grant update on table "public"."trap_types" to "anon";

grant delete on table "public"."trap_types" to "authenticated";

grant insert on table "public"."trap_types" to "authenticated";

grant references on table "public"."trap_types" to "authenticated";

grant select on table "public"."trap_types" to "authenticated";

grant trigger on table "public"."trap_types" to "authenticated";

grant truncate on table "public"."trap_types" to "authenticated";

grant update on table "public"."trap_types" to "authenticated";

grant delete on table "public"."trap_types" to "service_role";

grant insert on table "public"."trap_types" to "service_role";

grant references on table "public"."trap_types" to "service_role";

grant select on table "public"."trap_types" to "service_role";

grant trigger on table "public"."trap_types" to "service_role";

grant truncate on table "public"."trap_types" to "service_role";

grant update on table "public"."trap_types" to "service_role";

grant delete on table "public"."traps" to "anon";

grant insert on table "public"."traps" to "anon";

grant references on table "public"."traps" to "anon";

grant select on table "public"."traps" to "anon";

grant trigger on table "public"."traps" to "anon";

grant truncate on table "public"."traps" to "anon";

grant update on table "public"."traps" to "anon";

grant delete on table "public"."traps" to "authenticated";

grant insert on table "public"."traps" to "authenticated";

grant references on table "public"."traps" to "authenticated";

grant select on table "public"."traps" to "authenticated";

grant trigger on table "public"."traps" to "authenticated";

grant truncate on table "public"."traps" to "authenticated";

grant update on table "public"."traps" to "authenticated";

grant delete on table "public"."traps" to "service_role";

grant insert on table "public"."traps" to "service_role";

grant references on table "public"."traps" to "service_role";

grant select on table "public"."traps" to "service_role";

grant trigger on table "public"."traps" to "service_role";

grant truncate on table "public"."traps" to "service_role";

grant update on table "public"."traps" to "service_role";


  create policy "delete: own group manager"
  on "public"."trap_lures"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."trap_lures"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."trap_lures"
  as permissive
  for select
  to authenticated
using (((group_id IS NULL) OR public.user_is_group_member(group_id)));



  create policy "update: own group manager"
  on "public"."trap_lures"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: group manager"
  on "public"."trap_types"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: group manager"
  on "public"."trap_types"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."trap_types"
  as permissive
  for select
  to authenticated
using (((group_id IS NULL) OR public.user_is_group_member(group_id)));



  create policy "update: group manager"
  on "public"."trap_types"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."traps"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."traps"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."traps"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."traps"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.trap_lures FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.trap_lures FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.trap_lures FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.trap_types FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.trap_types FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.trap_types FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.traps FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.traps FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.traps FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


