alter table "public"."traps" drop constraint "unique_trap_name_per_group";

drop index if exists "public"."unique_trap_name_per_group";


