alter table "public"."units" drop constraint "base_unit_self_reference";

alter table "public"."units" drop constraint "check_base_unit_conversion";

alter table "public"."traps" drop constraint "traps_created_by_fkey";

alter table "public"."traps" drop constraint "traps_updated_by_fkey";

alter table "public"."traps" alter column "updated_at" set default now();

alter table "public"."traps" alter column "updated_at" set not null;

CREATE INDEX idx_regions_geom ON public.regions USING gist (geom);

alter table "public"."traps" add constraint "traps_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_created_by_fkey";

alter table "public"."traps" add constraint "traps_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_updated_by_fkey";


