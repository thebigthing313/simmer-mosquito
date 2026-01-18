create domain html_color as text
check (value ~* '^#[a-f0-9]{6}$');

create table "public"."habitat_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "habitat_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."habitat_tags" enable row level security;


  create table "public"."habitats" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "lat" double precision not null,
    "lng" double precision not null,
    "description" text not null,
    "is_active" boolean not null default true,
    "is_permanent" boolean not null default false,
    "is_inaccessible" boolean not null default false,
    "name" text,
    "location_id" uuid,
    "geom" extensions.geometry(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."habitats" enable row level security;


  create table "public"."tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "name" text not null,
    "description" text,
    "color" public.html_color,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_by" uuid
      );


alter table "public"."tags" enable row level security;

CREATE UNIQUE INDEX habitat_tags_pkey ON public.habitat_tags USING btree (id);

CREATE UNIQUE INDEX habitats_pkey ON public.habitats USING btree (id);

CREATE INDEX idx_habitats_geom ON public.habitats USING gist (geom);

CREATE UNIQUE INDEX name_unique ON public.tags USING btree (group_id, name);

CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id);

alter table "public"."habitat_tags" add constraint "habitat_tags_pkey" PRIMARY KEY using index "habitat_tags_pkey";

alter table "public"."habitats" add constraint "habitats_pkey" PRIMARY KEY using index "habitats_pkey";

alter table "public"."tags" add constraint "tags_pkey" PRIMARY KEY using index "tags_pkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_created_by_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_group_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_habitat_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_tag_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_updated_by_fkey";

alter table "public"."habitats" add constraint "habitats_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_created_by_fkey";

alter table "public"."habitats" add constraint "habitats_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_group_id_fkey";

alter table "public"."habitats" add constraint "habitats_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_location_id_fkey";

alter table "public"."habitats" add constraint "habitats_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_updated_by_fkey";

alter table "public"."tags" add constraint "name_unique" UNIQUE using index "name_unique";

alter table "public"."tags" add constraint "tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_created_by_fkey";

alter table "public"."tags" add constraint "tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_group_id_fkey";

alter table "public"."tags" add constraint "tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_updated_by_fkey";

grant delete on table "public"."habitat_tags" to "anon";

grant insert on table "public"."habitat_tags" to "anon";

grant references on table "public"."habitat_tags" to "anon";

grant select on table "public"."habitat_tags" to "anon";

grant trigger on table "public"."habitat_tags" to "anon";

grant truncate on table "public"."habitat_tags" to "anon";

grant update on table "public"."habitat_tags" to "anon";

grant delete on table "public"."habitat_tags" to "authenticated";

grant insert on table "public"."habitat_tags" to "authenticated";

grant references on table "public"."habitat_tags" to "authenticated";

grant select on table "public"."habitat_tags" to "authenticated";

grant trigger on table "public"."habitat_tags" to "authenticated";

grant truncate on table "public"."habitat_tags" to "authenticated";

grant update on table "public"."habitat_tags" to "authenticated";

grant delete on table "public"."habitat_tags" to "service_role";

grant insert on table "public"."habitat_tags" to "service_role";

grant references on table "public"."habitat_tags" to "service_role";

grant select on table "public"."habitat_tags" to "service_role";

grant trigger on table "public"."habitat_tags" to "service_role";

grant truncate on table "public"."habitat_tags" to "service_role";

grant update on table "public"."habitat_tags" to "service_role";

grant delete on table "public"."habitats" to "anon";

grant insert on table "public"."habitats" to "anon";

grant references on table "public"."habitats" to "anon";

grant select on table "public"."habitats" to "anon";

grant trigger on table "public"."habitats" to "anon";

grant truncate on table "public"."habitats" to "anon";

grant update on table "public"."habitats" to "anon";

grant delete on table "public"."habitats" to "authenticated";

grant insert on table "public"."habitats" to "authenticated";

grant references on table "public"."habitats" to "authenticated";

grant select on table "public"."habitats" to "authenticated";

grant trigger on table "public"."habitats" to "authenticated";

grant truncate on table "public"."habitats" to "authenticated";

grant update on table "public"."habitats" to "authenticated";

grant delete on table "public"."habitats" to "service_role";

grant insert on table "public"."habitats" to "service_role";

grant references on table "public"."habitats" to "service_role";

grant select on table "public"."habitats" to "service_role";

grant trigger on table "public"."habitats" to "service_role";

grant truncate on table "public"."habitats" to "service_role";

grant update on table "public"."habitats" to "service_role";

grant delete on table "public"."tags" to "anon";

grant insert on table "public"."tags" to "anon";

grant references on table "public"."tags" to "anon";

grant select on table "public"."tags" to "anon";

grant trigger on table "public"."tags" to "anon";

grant truncate on table "public"."tags" to "anon";

grant update on table "public"."tags" to "anon";

grant delete on table "public"."tags" to "authenticated";

grant insert on table "public"."tags" to "authenticated";

grant references on table "public"."tags" to "authenticated";

grant select on table "public"."tags" to "authenticated";

grant trigger on table "public"."tags" to "authenticated";

grant truncate on table "public"."tags" to "authenticated";

grant update on table "public"."tags" to "authenticated";

grant delete on table "public"."tags" to "service_role";

grant insert on table "public"."tags" to "service_role";

grant references on table "public"."tags" to "service_role";

grant select on table "public"."tags" to "service_role";

grant trigger on table "public"."tags" to "service_role";

grant truncate on table "public"."tags" to "service_role";

grant update on table "public"."tags" to "service_role";


  create policy "delete: own groups collector"
  on "public"."habitat_tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 4));



  create policy "insert: own groups collector"
  on "public"."habitat_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."habitat_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collector"
  on "public"."habitat_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own groups manager"
  on "public"."habitats"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own groups collector"
  on "public"."habitats"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."habitats"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collector"
  on "public"."habitats"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."tags"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups"
  on "public"."tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));


CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.habitat_tags FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.habitat_tags FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.habitat_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.habitats FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.habitats FOR EACH ROW EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.habitats FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER handle_created_trigger BEFORE INSERT ON public.tags FOR EACH ROW EXECUTE FUNCTION simmer.set_created_by();

CREATE TRIGGER handle_updated_trigger BEFORE UPDATE ON public.tags FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION public.set_updated_record_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


