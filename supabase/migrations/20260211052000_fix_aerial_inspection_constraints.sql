alter table "public"."aerial_inspections" drop constraint "larval_data_present";

alter table "public"."aerial_inspections" add constraint "larval_data_present" CHECK (((is_wet = false) OR ((is_wet = true) AND (((larvae_count IS NOT NULL) AND (dips_count IS NOT NULL)) OR (larvae_per_dip IS NOT NULL) OR (density_id IS NOT NULL))))) not valid;

alter table "public"."aerial_inspections" validate constraint "larval_data_present";


