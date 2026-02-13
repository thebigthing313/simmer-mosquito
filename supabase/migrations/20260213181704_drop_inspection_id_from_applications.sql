alter table "public"."applications" drop constraint "applications_inspection_id_fkey";

alter table "public"."applications" drop constraint "one_originating_table";

alter table "public"."applications" drop column "inspection_id";

alter table "public"."applications" add constraint "one_originating_table" CHECK ((((((((flight_aerial_site_id IS NOT NULL))::integer + ((catch_basin_mission_id IS NOT NULL))::integer) + ((truck_ulv_id IS NOT NULL))::integer) + ((hand_ulv_id IS NOT NULL))::integer) + ((point_larviciding_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."applications" validate constraint "one_originating_table";


