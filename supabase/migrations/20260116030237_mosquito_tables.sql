
  create table "public"."genera" (
    "id" uuid not null default gen_random_uuid(),
    "genus_name" text not null,
    "abbreviation" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."genera" enable row level security;


  create table "public"."species" (
    "id" uuid not null default gen_random_uuid(),
    "genus_id" uuid,
    "species_name" text not null,
    "sample_photo_url" text,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."species" enable row level security;

CREATE UNIQUE INDEX genera_abbreviation_key ON public.genera USING btree (abbreviation);

CREATE UNIQUE INDEX genera_genus_name_key ON public.genera USING btree (genus_name);

CREATE UNIQUE INDEX genera_pkey ON public.genera USING btree (id);

CREATE UNIQUE INDEX species_pkey ON public.species USING btree (id);

CREATE UNIQUE INDEX species_species_name_key ON public.species USING btree (species_name);

alter table "public"."genera" add constraint "genera_pkey" PRIMARY KEY using index "genera_pkey";

alter table "public"."species" add constraint "species_pkey" PRIMARY KEY using index "species_pkey";

alter table "public"."genera" add constraint "genera_abbreviation_key" UNIQUE using index "genera_abbreviation_key";

alter table "public"."genera" add constraint "genera_genus_name_key" UNIQUE using index "genera_genus_name_key";

alter table "public"."species" add constraint "species_genus_id_fkey" FOREIGN KEY (genus_id) REFERENCES public.genera(id) ON DELETE RESTRICT not valid;

alter table "public"."species" validate constraint "species_genus_id_fkey";

alter table "public"."species" add constraint "species_species_name_key" UNIQUE using index "species_species_name_key";

grant delete on table "public"."genera" to "anon";

grant insert on table "public"."genera" to "anon";

grant references on table "public"."genera" to "anon";

grant select on table "public"."genera" to "anon";

grant trigger on table "public"."genera" to "anon";

grant truncate on table "public"."genera" to "anon";

grant update on table "public"."genera" to "anon";

grant delete on table "public"."genera" to "authenticated";

grant insert on table "public"."genera" to "authenticated";

grant references on table "public"."genera" to "authenticated";

grant select on table "public"."genera" to "authenticated";

grant trigger on table "public"."genera" to "authenticated";

grant truncate on table "public"."genera" to "authenticated";

grant update on table "public"."genera" to "authenticated";

grant delete on table "public"."genera" to "service_role";

grant insert on table "public"."genera" to "service_role";

grant references on table "public"."genera" to "service_role";

grant select on table "public"."genera" to "service_role";

grant trigger on table "public"."genera" to "service_role";

grant truncate on table "public"."genera" to "service_role";

grant update on table "public"."genera" to "service_role";

grant delete on table "public"."species" to "anon";

grant insert on table "public"."species" to "anon";

grant references on table "public"."species" to "anon";

grant select on table "public"."species" to "anon";

grant trigger on table "public"."species" to "anon";

grant truncate on table "public"."species" to "anon";

grant update on table "public"."species" to "anon";

grant delete on table "public"."species" to "authenticated";

grant insert on table "public"."species" to "authenticated";

grant references on table "public"."species" to "authenticated";

grant select on table "public"."species" to "authenticated";

grant trigger on table "public"."species" to "authenticated";

grant truncate on table "public"."species" to "authenticated";

grant update on table "public"."species" to "authenticated";

grant delete on table "public"."species" to "service_role";

grant insert on table "public"."species" to "service_role";

grant references on table "public"."species" to "service_role";

grant select on table "public"."species" to "service_role";

grant trigger on table "public"."species" to "service_role";

grant truncate on table "public"."species" to "service_role";

grant update on table "public"."species" to "service_role";


  create policy "delete: none"
  on "public"."genera"
  as permissive
  for delete
  to public
using (false);



  create policy "insert: none"
  on "public"."genera"
  as permissive
  for insert
  to public
with check (false);



  create policy "select: anyone"
  on "public"."genera"
  as permissive
  for select
  to public
using (true);



  create policy "update: none"
  on "public"."genera"
  as permissive
  for update
  to public
using (false)
with check (false);



  create policy "delete: none"
  on "public"."species"
  as permissive
  for delete
  to public
using (false);



  create policy "insert: none"
  on "public"."species"
  as permissive
  for insert
  to public
with check (false);



  create policy "select: anyone"
  on "public"."species"
  as permissive
  for select
  to public
using (true);



  create policy "update: none"
  on "public"."species"
  as permissive
  for update
  to public
using (false)
with check (false);


CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.genera FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.species FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


