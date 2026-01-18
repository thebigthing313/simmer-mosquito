drop policy "delete: own group manager" on "public"."collections";

drop policy "insert: own group manager" on "public"."collections";

drop policy "select: own groups or group_id is null" on "public"."collections";

drop policy "update: own group manager" on "public"."collections";

alter table "public"."collection_species" drop constraint "collection_species_group_id_fkey";

alter table "public"."collections" drop constraint "collections_group_id_fkey";

alter table "public"."habitat_tags" drop constraint "habitat_tags_group_id_fkey";

alter table "public"."habitats" drop constraint "habitats_group_id_fkey";

alter table "public"."tags" drop constraint "tags_group_id_fkey";

alter table "public"."traps" drop constraint "traps_group_id_fkey";


  create table "public"."inspections" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "habitat_id" uuid not null,
    "inspection_date" date not null,
    "inspector_id" uuid,
    "is_wet" boolean not null default false,
    "dips" integer,
    "total_larvae" integer,
    "density_id" uuid,
    "has_eggs" boolean not null default false,
    "has_1st_instar" boolean not null default false,
    "has_2nd_instar" boolean not null default false,
    "has_3rd_instar" boolean not null default false,
    "has_4th_instar" boolean not null default false,
    "has_pupae" boolean not null default false,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."inspections" enable row level security;


  create table "public"."larval_densities" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "range_start" integer not null,
    "range_end" integer not null,
    "name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."larval_densities" enable row level security;

CREATE UNIQUE INDEX inspections_pkey ON public.inspections USING btree (id);

CREATE UNIQUE INDEX larval_densities_pkey ON public.larval_densities USING btree (id);

alter table "public"."inspections" add constraint "inspections_pkey" PRIMARY KEY using index "inspections_pkey";

alter table "public"."larval_densities" add constraint "larval_densities_pkey" PRIMARY KEY using index "larval_densities_pkey";

alter table "public"."inspections" add constraint "data_integrity" CHECK (((is_wet = false) OR ((total_larvae IS NOT NULL) AND (dips IS NOT NULL)) OR (density_id IS NOT NULL) OR ((total_larvae IS NULL) AND (density_id IS NULL)))) not valid;

alter table "public"."inspections" validate constraint "data_integrity";

alter table "public"."inspections" add constraint "inspections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_created_by_fkey";

alter table "public"."inspections" add constraint "inspections_density_id_fkey" FOREIGN KEY (density_id) REFERENCES public.larval_densities(id) ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_density_id_fkey";

alter table "public"."inspections" add constraint "inspections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_group_id_fkey";

alter table "public"."inspections" add constraint "inspections_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_habitat_id_fkey";

alter table "public"."inspections" add constraint "inspections_inspector_id_fkey" FOREIGN KEY (inspector_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_inspector_id_fkey";

alter table "public"."inspections" add constraint "inspections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_updated_by_fkey";

alter table "public"."larval_densities" add constraint "larval_densities_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."larval_densities" validate constraint "larval_densities_created_by_fkey";

alter table "public"."larval_densities" add constraint "larval_densities_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."larval_densities" validate constraint "larval_densities_group_id_fkey";

alter table "public"."larval_densities" add constraint "larval_densities_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."larval_densities" validate constraint "larval_densities_updated_by_fkey";

alter table "public"."larval_densities" add constraint "range_valid" CHECK ((range_start < range_end)) not valid;

alter table "public"."larval_densities" validate constraint "range_valid";

alter table "public"."collection_species" add constraint "collection_species_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."collection_species" validate constraint "collection_species_group_id_fkey";

alter table "public"."collections" add constraint "collections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."collections" validate constraint "collections_group_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_group_id_fkey";

alter table "public"."habitats" add constraint "habitats_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."habitats" validate constraint "habitats_group_id_fkey";

alter table "public"."tags" add constraint "tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."tags" validate constraint "tags_group_id_fkey";

alter table "public"."traps" add constraint "traps_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_group_id_fkey";

grant delete on table "public"."inspections" to "anon";

grant insert on table "public"."inspections" to "anon";

grant references on table "public"."inspections" to "anon";

grant select on table "public"."inspections" to "anon";

grant trigger on table "public"."inspections" to "anon";

grant truncate on table "public"."inspections" to "anon";

grant update on table "public"."inspections" to "anon";

grant delete on table "public"."inspections" to "authenticated";

grant insert on table "public"."inspections" to "authenticated";

grant references on table "public"."inspections" to "authenticated";

grant select on table "public"."inspections" to "authenticated";

grant trigger on table "public"."inspections" to "authenticated";

grant truncate on table "public"."inspections" to "authenticated";

grant update on table "public"."inspections" to "authenticated";

grant delete on table "public"."inspections" to "service_role";

grant insert on table "public"."inspections" to "service_role";

grant references on table "public"."inspections" to "service_role";

grant select on table "public"."inspections" to "service_role";

grant trigger on table "public"."inspections" to "service_role";

grant truncate on table "public"."inspections" to "service_role";

grant update on table "public"."inspections" to "service_role";

grant delete on table "public"."larval_densities" to "anon";

grant insert on table "public"."larval_densities" to "anon";

grant references on table "public"."larval_densities" to "anon";

grant select on table "public"."larval_densities" to "anon";

grant trigger on table "public"."larval_densities" to "anon";

grant truncate on table "public"."larval_densities" to "anon";

grant update on table "public"."larval_densities" to "anon";

grant delete on table "public"."larval_densities" to "authenticated";

grant insert on table "public"."larval_densities" to "authenticated";

grant references on table "public"."larval_densities" to "authenticated";

grant select on table "public"."larval_densities" to "authenticated";

grant trigger on table "public"."larval_densities" to "authenticated";

grant truncate on table "public"."larval_densities" to "authenticated";

grant update on table "public"."larval_densities" to "authenticated";

grant delete on table "public"."larval_densities" to "service_role";

grant insert on table "public"."larval_densities" to "service_role";

grant references on table "public"."larval_densities" to "service_role";

grant select on table "public"."larval_densities" to "service_role";

grant trigger on table "public"."larval_densities" to "service_role";

grant truncate on table "public"."larval_densities" to "service_role";

grant update on table "public"."larval_densities" to "service_role";


  create policy "delete: own group manager or own records"
  on "public"."collections"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."collections"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."collections"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."collections"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager or own records"
  on "public"."inspections"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."inspections"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."inspections"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."inspections"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."larval_densities"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."larval_densities"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups"
  on "public"."larval_densities"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."larval_densities"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.inspections FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.inspections FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.inspections FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.larval_densities FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.larval_densities FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.larval_densities FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


