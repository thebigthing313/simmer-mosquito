alter table "public"."groups" drop constraint "groups_short_name_key";

drop index if exists "public"."groups_short_name_key";

alter table "public"."groups" alter column "short_name" drop not null;

alter table "public"."groups" enable row level security;

alter table "public"."profiles" enable row level security;


