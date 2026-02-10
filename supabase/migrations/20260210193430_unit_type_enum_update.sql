alter type "public"."unit_type" rename to "unit_type__old_version_to_be_dropped";

create type "public"."unit_type" as enum ('weight', 'distance', 'area', 'volume', 'temperature', 'duration', 'count');

alter table "public"."units" alter column unit_type type "public"."unit_type" using unit_type::text::"public"."unit_type";

drop type "public"."unit_type__old_version_to_be_dropped";


