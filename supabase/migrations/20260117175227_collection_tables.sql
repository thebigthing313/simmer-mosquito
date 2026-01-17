create type "public"."species_sex_enum" as enum ('male', 'female');

create type "public"."species_status_enum" as enum ('damaged', 'unfed', 'bloodfed', 'gravid');


  create table "public"."collection_species" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "collection_id" uuid not null,
    "species_id" uuid not null,
    "count" integer not null,
    "identified_by" uuid,
    "identified_date" date not null,
    "sex" public.species_sex_enum default 'female'::public.species_sex_enum,
    "status" public.species_status_enum,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."collection_species" enable row level security;


  create table "public"."collections" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "trap_id" uuid not null,
    "trap_lure_id" uuid,
    "collection_date" date,
    "collected_by" uuid,
    "trap_set_date" date,
    "trap_set_by" uuid,
    "trap_nights" integer,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."collections" enable row level security;

CREATE UNIQUE INDEX collection_species_pkey ON public.collection_species USING btree (id);

CREATE UNIQUE INDEX collections_pkey ON public.collections USING btree (id);

alter table "public"."collection_species" add constraint "collection_species_pkey" PRIMARY KEY using index "collection_species_pkey";

alter table "public"."collections" add constraint "collections_pkey" PRIMARY KEY using index "collections_pkey";

alter table "public"."collection_species" add constraint "collection_species_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE not valid;

alter table "public"."collection_species" validate constraint "collection_species_collection_id_fkey";

alter table "public"."collection_species" add constraint "collection_species_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."collection_species" validate constraint "collection_species_created_by_fkey";

alter table "public"."collection_species" add constraint "collection_species_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."collection_species" validate constraint "collection_species_group_id_fkey";

alter table "public"."collection_species" add constraint "collection_species_identified_by_fkey" FOREIGN KEY (identified_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."collection_species" validate constraint "collection_species_identified_by_fkey";

alter table "public"."collection_species" add constraint "collection_species_species_id_fkey" FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT not valid;

alter table "public"."collection_species" validate constraint "collection_species_species_id_fkey";

alter table "public"."collection_species" add constraint "collection_species_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."collection_species" validate constraint "collection_species_updated_by_fkey";

alter table "public"."collection_species" add constraint "count_non_negative" CHECK ((count >= 0)) not valid;

alter table "public"."collection_species" validate constraint "count_non_negative";

alter table "public"."collections" add constraint "collections_collected_by_fkey" FOREIGN KEY (collected_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_collected_by_fkey";

alter table "public"."collections" add constraint "collections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_created_by_fkey";

alter table "public"."collections" add constraint "collections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_group_id_fkey";

alter table "public"."collections" add constraint "collections_trap_id_fkey" FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON DELETE RESTRICT not valid;

alter table "public"."collections" validate constraint "collections_trap_id_fkey";

alter table "public"."collections" add constraint "collections_trap_lure_id_fkey" FOREIGN KEY (trap_lure_id) REFERENCES public.trap_lures(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_trap_lure_id_fkey";

alter table "public"."collections" add constraint "collections_trap_set_by_fkey" FOREIGN KEY (trap_set_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_trap_set_by_fkey";

alter table "public"."collections" add constraint "collections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_updated_by_fkey";

grant delete on table "public"."collection_species" to "anon";

grant insert on table "public"."collection_species" to "anon";

grant references on table "public"."collection_species" to "anon";

grant select on table "public"."collection_species" to "anon";

grant trigger on table "public"."collection_species" to "anon";

grant truncate on table "public"."collection_species" to "anon";

grant update on table "public"."collection_species" to "anon";

grant delete on table "public"."collection_species" to "authenticated";

grant insert on table "public"."collection_species" to "authenticated";

grant references on table "public"."collection_species" to "authenticated";

grant select on table "public"."collection_species" to "authenticated";

grant trigger on table "public"."collection_species" to "authenticated";

grant truncate on table "public"."collection_species" to "authenticated";

grant update on table "public"."collection_species" to "authenticated";

grant delete on table "public"."collection_species" to "service_role";

grant insert on table "public"."collection_species" to "service_role";

grant references on table "public"."collection_species" to "service_role";

grant select on table "public"."collection_species" to "service_role";

grant trigger on table "public"."collection_species" to "service_role";

grant truncate on table "public"."collection_species" to "service_role";

grant update on table "public"."collection_species" to "service_role";

grant delete on table "public"."collections" to "anon";

grant insert on table "public"."collections" to "anon";

grant references on table "public"."collections" to "anon";

grant select on table "public"."collections" to "anon";

grant trigger on table "public"."collections" to "anon";

grant truncate on table "public"."collections" to "anon";

grant update on table "public"."collections" to "anon";

grant delete on table "public"."collections" to "authenticated";

grant insert on table "public"."collections" to "authenticated";

grant references on table "public"."collections" to "authenticated";

grant select on table "public"."collections" to "authenticated";

grant trigger on table "public"."collections" to "authenticated";

grant truncate on table "public"."collections" to "authenticated";

grant update on table "public"."collections" to "authenticated";

grant delete on table "public"."collections" to "service_role";

grant insert on table "public"."collections" to "service_role";

grant references on table "public"."collections" to "service_role";

grant select on table "public"."collections" to "service_role";

grant trigger on table "public"."collections" to "service_role";

grant truncate on table "public"."collections" to "service_role";

grant update on table "public"."collections" to "service_role";


  create policy "delete: own groups collector"
  on "public"."collection_species"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 4));



  create policy "insert: own groups collector"
  on "public"."collection_species"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."collection_species"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collector"
  on "public"."collection_species"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."collections"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."collections"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."collections"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."collections"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.collection_species FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.collection_species FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.collection_species FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.collections FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.collections FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.collections FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


