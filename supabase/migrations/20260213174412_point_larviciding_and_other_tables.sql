alter table "public"."applications" drop constraint "one_originating_table";


  create table "public"."application_methods" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "method_name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."application_methods" enable row level security;


  create table "public"."equipment" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "equipment_name" text not null,
    "serial_number" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."equipment" enable row level security;


  create table "public"."point_larviciding" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "habitat_id" uuid not null,
    "inspection_id" uuid,
    "application_method_id" uuid,
    "application_equipment_id" uuid,
    "application_area" double precision,
    "application_area_unit_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."point_larviciding" enable row level security;

alter table "public"."applications" add column "point_larviciding_id" uuid;

CREATE UNIQUE INDEX application_methods_pkey ON public.application_methods USING btree (id);

CREATE UNIQUE INDEX equipment_pkey ON public.equipment USING btree (id);

CREATE UNIQUE INDEX point_larviciding_pkey ON public.point_larviciding USING btree (id);

CREATE UNIQUE INDEX unique_equipment_name_serial_number ON public.equipment USING btree (group_id, equipment_name, serial_number);

CREATE UNIQUE INDEX unique_method_name ON public.application_methods USING btree (group_id, method_name);

alter table "public"."application_methods" add constraint "application_methods_pkey" PRIMARY KEY using index "application_methods_pkey";

alter table "public"."equipment" add constraint "equipment_pkey" PRIMARY KEY using index "equipment_pkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_pkey" PRIMARY KEY using index "point_larviciding_pkey";

alter table "public"."application_methods" add constraint "application_methods_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."application_methods" validate constraint "application_methods_created_by_fkey";

alter table "public"."application_methods" add constraint "application_methods_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."application_methods" validate constraint "application_methods_group_id_fkey";

alter table "public"."application_methods" add constraint "application_methods_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."application_methods" validate constraint "application_methods_updated_by_fkey";

alter table "public"."application_methods" add constraint "unique_method_name" UNIQUE using index "unique_method_name";

alter table "public"."applications" add constraint "applications_point_larviciding_id_fkey" FOREIGN KEY (point_larviciding_id) REFERENCES public.point_larviciding(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_point_larviciding_id_fkey";

alter table "public"."equipment" add constraint "equipment_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."equipment" validate constraint "equipment_created_by_fkey";

alter table "public"."equipment" add constraint "equipment_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."equipment" validate constraint "equipment_group_id_fkey";

alter table "public"."equipment" add constraint "equipment_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."equipment" validate constraint "equipment_updated_by_fkey";

alter table "public"."equipment" add constraint "unique_equipment_name_serial_number" UNIQUE using index "unique_equipment_name_serial_number";

alter table "public"."point_larviciding" add constraint "area_and_unit" CHECK ((((application_area IS NULL) AND (application_area_unit_id IS NULL)) OR ((application_area IS NOT NULL) AND (application_area_unit_id IS NOT NULL)))) not valid;

alter table "public"."point_larviciding" validate constraint "area_and_unit";

alter table "public"."point_larviciding" add constraint "point_larviciding_application_area_unit_id_fkey" FOREIGN KEY (application_area_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_application_area_unit_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_application_equipment_id_fkey" FOREIGN KEY (application_equipment_id) REFERENCES public.equipment(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_application_equipment_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_application_method_id_fkey" FOREIGN KEY (application_method_id) REFERENCES public.application_methods(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_application_method_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_created_by_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_group_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_habitat_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_inspection_id_fkey";

alter table "public"."point_larviciding" add constraint "point_larviciding_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."point_larviciding" validate constraint "point_larviciding_updated_by_fkey";

alter table "public"."applications" add constraint "one_originating_table" CHECK (((((((((inspection_id IS NOT NULL))::integer + ((flight_aerial_site_id IS NOT NULL))::integer) + ((catch_basin_mission_id IS NOT NULL))::integer) + ((truck_ulv_id IS NOT NULL))::integer) + ((hand_ulv_id IS NOT NULL))::integer) + ((point_larviciding_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."applications" validate constraint "one_originating_table";

grant delete on table "public"."application_methods" to "anon";

grant insert on table "public"."application_methods" to "anon";

grant references on table "public"."application_methods" to "anon";

grant select on table "public"."application_methods" to "anon";

grant trigger on table "public"."application_methods" to "anon";

grant truncate on table "public"."application_methods" to "anon";

grant update on table "public"."application_methods" to "anon";

grant delete on table "public"."application_methods" to "authenticated";

grant insert on table "public"."application_methods" to "authenticated";

grant references on table "public"."application_methods" to "authenticated";

grant select on table "public"."application_methods" to "authenticated";

grant trigger on table "public"."application_methods" to "authenticated";

grant truncate on table "public"."application_methods" to "authenticated";

grant update on table "public"."application_methods" to "authenticated";

grant delete on table "public"."application_methods" to "service_role";

grant insert on table "public"."application_methods" to "service_role";

grant references on table "public"."application_methods" to "service_role";

grant select on table "public"."application_methods" to "service_role";

grant trigger on table "public"."application_methods" to "service_role";

grant truncate on table "public"."application_methods" to "service_role";

grant update on table "public"."application_methods" to "service_role";

grant delete on table "public"."equipment" to "anon";

grant insert on table "public"."equipment" to "anon";

grant references on table "public"."equipment" to "anon";

grant select on table "public"."equipment" to "anon";

grant trigger on table "public"."equipment" to "anon";

grant truncate on table "public"."equipment" to "anon";

grant update on table "public"."equipment" to "anon";

grant delete on table "public"."equipment" to "authenticated";

grant insert on table "public"."equipment" to "authenticated";

grant references on table "public"."equipment" to "authenticated";

grant select on table "public"."equipment" to "authenticated";

grant trigger on table "public"."equipment" to "authenticated";

grant truncate on table "public"."equipment" to "authenticated";

grant update on table "public"."equipment" to "authenticated";

grant delete on table "public"."equipment" to "service_role";

grant insert on table "public"."equipment" to "service_role";

grant references on table "public"."equipment" to "service_role";

grant select on table "public"."equipment" to "service_role";

grant trigger on table "public"."equipment" to "service_role";

grant truncate on table "public"."equipment" to "service_role";

grant update on table "public"."equipment" to "service_role";

grant delete on table "public"."point_larviciding" to "anon";

grant insert on table "public"."point_larviciding" to "anon";

grant references on table "public"."point_larviciding" to "anon";

grant select on table "public"."point_larviciding" to "anon";

grant trigger on table "public"."point_larviciding" to "anon";

grant truncate on table "public"."point_larviciding" to "anon";

grant update on table "public"."point_larviciding" to "anon";

grant delete on table "public"."point_larviciding" to "authenticated";

grant insert on table "public"."point_larviciding" to "authenticated";

grant references on table "public"."point_larviciding" to "authenticated";

grant select on table "public"."point_larviciding" to "authenticated";

grant trigger on table "public"."point_larviciding" to "authenticated";

grant truncate on table "public"."point_larviciding" to "authenticated";

grant update on table "public"."point_larviciding" to "authenticated";

grant delete on table "public"."point_larviciding" to "service_role";

grant insert on table "public"."point_larviciding" to "service_role";

grant references on table "public"."point_larviciding" to "service_role";

grant select on table "public"."point_larviciding" to "service_role";

grant trigger on table "public"."point_larviciding" to "service_role";

grant truncate on table "public"."point_larviciding" to "service_role";

grant update on table "public"."point_larviciding" to "service_role";


  create policy "delete: own group admin"
  on "public"."application_methods"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."application_methods"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."application_methods"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group admin"
  on "public"."application_methods"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group admin"
  on "public"."equipment"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."equipment"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."equipment"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group admin"
  on "public"."equipment"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group manager or own records"
  on "public"."point_larviciding"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."point_larviciding"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."point_larviciding"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."point_larviciding"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.application_methods FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.application_methods FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.equipment FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.point_larviciding FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.point_larviciding FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


