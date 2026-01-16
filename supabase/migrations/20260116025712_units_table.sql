create type "public"."unit_system" as enum ('si', 'imperial', 'us_customary');

create type "public"."unit_type" as enum ('weight', 'distance', 'area', 'volume', 'temperature', 'time', 'count');


  create table "public"."units" (
    "id" uuid not null default gen_random_uuid(),
    "unit_name" text not null,
    "abbreviation" text not null,
    "unit_type" public.unit_type not null,
    "unit_system" public.unit_system,
    "base_unit_id" uuid,
    "conversion_factor" numeric not null,
    "conversion_offset" numeric not null default 0.0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."units" enable row level security;

CREATE UNIQUE INDEX units_abbreviation_key ON public.units USING btree (abbreviation);

CREATE UNIQUE INDEX units_pkey ON public.units USING btree (id);

CREATE UNIQUE INDEX units_unit_name_key ON public.units USING btree (unit_name);

alter table "public"."units" add constraint "units_pkey" PRIMARY KEY using index "units_pkey";

alter table "public"."units" add constraint "base_unit_self_reference" CHECK ((((base_unit_id = id) AND (conversion_factor = 1.0)) OR (base_unit_id <> id))) not valid;

alter table "public"."units" validate constraint "base_unit_self_reference";

alter table "public"."units" add constraint "check_base_unit_conversion" CHECK ((((base_unit_id IS NULL) AND (conversion_factor = 1.0) AND (conversion_offset = 0.0)) OR ((base_unit_id IS NOT NULL) AND (conversion_factor <> 0.0)))) not valid;

alter table "public"."units" validate constraint "check_base_unit_conversion";

alter table "public"."units" add constraint "units_abbreviation_key" UNIQUE using index "units_abbreviation_key";

alter table "public"."units" add constraint "units_base_unit_id_fkey" FOREIGN KEY (base_unit_id) REFERENCES public.units(id) not valid;

alter table "public"."units" validate constraint "units_base_unit_id_fkey";

alter table "public"."units" add constraint "units_unit_name_key" UNIQUE using index "units_unit_name_key";

grant delete on table "public"."units" to "anon";

grant insert on table "public"."units" to "anon";

grant references on table "public"."units" to "anon";

grant select on table "public"."units" to "anon";

grant trigger on table "public"."units" to "anon";

grant truncate on table "public"."units" to "anon";

grant update on table "public"."units" to "anon";

grant delete on table "public"."units" to "authenticated";

grant insert on table "public"."units" to "authenticated";

grant references on table "public"."units" to "authenticated";

grant select on table "public"."units" to "authenticated";

grant trigger on table "public"."units" to "authenticated";

grant truncate on table "public"."units" to "authenticated";

grant update on table "public"."units" to "authenticated";

grant delete on table "public"."units" to "service_role";

grant insert on table "public"."units" to "service_role";

grant references on table "public"."units" to "service_role";

grant select on table "public"."units" to "service_role";

grant trigger on table "public"."units" to "service_role";

grant truncate on table "public"."units" to "service_role";

grant update on table "public"."units" to "service_role";


  create policy "delete: none"
  on "public"."units"
  as permissive
  for delete
  to public
using (false);



  create policy "insert: none"
  on "public"."units"
  as permissive
  for insert
  to public
with check (false);



  create policy "select: anyone"
  on "public"."units"
  as permissive
  for select
  to public
using (true);



  create policy "update: none"
  on "public"."units"
  as permissive
  for update
  to public
using (false)
with check (false);


CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.units FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


