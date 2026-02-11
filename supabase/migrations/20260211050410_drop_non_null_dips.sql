alter table "public"."aerial_inspections" alter column "dips_count" drop not null;

alter table "public"."aerial_inspections" alter column "inspected_by" set not null;


