create type "public"."request_intake_type" as enum ('online', 'phone', 'walk-in', 'other');

drop trigger if exists "set_audit_fields" on "public"."areawide_adulticiding";

drop trigger if exists "soft_delete_trigger" on "public"."areawide_adulticiding";

drop trigger if exists "set_audit_fields" on "public"."hand_ulvs";

drop trigger if exists "soft_delete_trigger" on "public"."hand_ulvs";

drop trigger if exists "set_audit_fields" on "public"."point_larviciding";

drop trigger if exists "soft_delete_trigger" on "public"."point_larviciding";

drop policy "delete: own group manager or own records" on "public"."areawide_adulticiding";

drop policy "insert: own group collector" on "public"."areawide_adulticiding";

drop policy "select: own groups" on "public"."areawide_adulticiding";

drop policy "update: own group collector" on "public"."areawide_adulticiding";

drop policy "delete: own group manager or own records" on "public"."hand_ulvs";

drop policy "insert: own group collector" on "public"."hand_ulvs";

drop policy "select: own groups" on "public"."hand_ulvs";

drop policy "update: own group collector" on "public"."hand_ulvs";

drop policy "delete: own group manager or own records" on "public"."point_larviciding";

drop policy "insert: own group collector" on "public"."point_larviciding";

drop policy "select: own groups" on "public"."point_larviciding";

drop policy "update: own group collector" on "public"."point_larviciding";

revoke delete on table "public"."areawide_adulticiding" from "anon";

revoke insert on table "public"."areawide_adulticiding" from "anon";

revoke references on table "public"."areawide_adulticiding" from "anon";

revoke select on table "public"."areawide_adulticiding" from "anon";

revoke trigger on table "public"."areawide_adulticiding" from "anon";

revoke truncate on table "public"."areawide_adulticiding" from "anon";

revoke update on table "public"."areawide_adulticiding" from "anon";

revoke delete on table "public"."areawide_adulticiding" from "authenticated";

revoke insert on table "public"."areawide_adulticiding" from "authenticated";

revoke references on table "public"."areawide_adulticiding" from "authenticated";

revoke select on table "public"."areawide_adulticiding" from "authenticated";

revoke trigger on table "public"."areawide_adulticiding" from "authenticated";

revoke truncate on table "public"."areawide_adulticiding" from "authenticated";

revoke update on table "public"."areawide_adulticiding" from "authenticated";

revoke delete on table "public"."areawide_adulticiding" from "service_role";

revoke insert on table "public"."areawide_adulticiding" from "service_role";

revoke references on table "public"."areawide_adulticiding" from "service_role";

revoke select on table "public"."areawide_adulticiding" from "service_role";

revoke trigger on table "public"."areawide_adulticiding" from "service_role";

revoke truncate on table "public"."areawide_adulticiding" from "service_role";

revoke update on table "public"."areawide_adulticiding" from "service_role";

revoke delete on table "public"."hand_ulvs" from "anon";

revoke insert on table "public"."hand_ulvs" from "anon";

revoke references on table "public"."hand_ulvs" from "anon";

revoke select on table "public"."hand_ulvs" from "anon";

revoke trigger on table "public"."hand_ulvs" from "anon";

revoke truncate on table "public"."hand_ulvs" from "anon";

revoke update on table "public"."hand_ulvs" from "anon";

revoke delete on table "public"."hand_ulvs" from "authenticated";

revoke insert on table "public"."hand_ulvs" from "authenticated";

revoke references on table "public"."hand_ulvs" from "authenticated";

revoke select on table "public"."hand_ulvs" from "authenticated";

revoke trigger on table "public"."hand_ulvs" from "authenticated";

revoke truncate on table "public"."hand_ulvs" from "authenticated";

revoke update on table "public"."hand_ulvs" from "authenticated";

revoke delete on table "public"."hand_ulvs" from "service_role";

revoke insert on table "public"."hand_ulvs" from "service_role";

revoke references on table "public"."hand_ulvs" from "service_role";

revoke select on table "public"."hand_ulvs" from "service_role";

revoke trigger on table "public"."hand_ulvs" from "service_role";

revoke truncate on table "public"."hand_ulvs" from "service_role";

revoke update on table "public"."hand_ulvs" from "service_role";

revoke delete on table "public"."point_larviciding" from "anon";

revoke insert on table "public"."point_larviciding" from "anon";

revoke references on table "public"."point_larviciding" from "anon";

revoke select on table "public"."point_larviciding" from "anon";

revoke trigger on table "public"."point_larviciding" from "anon";

revoke truncate on table "public"."point_larviciding" from "anon";

revoke update on table "public"."point_larviciding" from "anon";

revoke delete on table "public"."point_larviciding" from "authenticated";

revoke insert on table "public"."point_larviciding" from "authenticated";

revoke references on table "public"."point_larviciding" from "authenticated";

revoke select on table "public"."point_larviciding" from "authenticated";

revoke trigger on table "public"."point_larviciding" from "authenticated";

revoke truncate on table "public"."point_larviciding" from "authenticated";

revoke update on table "public"."point_larviciding" from "authenticated";

revoke delete on table "public"."point_larviciding" from "service_role";

revoke insert on table "public"."point_larviciding" from "service_role";

revoke references on table "public"."point_larviciding" from "service_role";

revoke select on table "public"."point_larviciding" from "service_role";

revoke trigger on table "public"."point_larviciding" from "service_role";

revoke truncate on table "public"."point_larviciding" from "service_role";

revoke update on table "public"."point_larviciding" from "service_role";

alter table "public"."applications" drop constraint "applications_areawide_adulticiding_id_fkey";

alter table "public"."applications" drop constraint "applications_hand_ulv_id_fkey";

alter table "public"."applications" drop constraint "applications_point_larviciding_id_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_created_by_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_group_id_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_temperature_unit_id_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_updated_by_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_vehicle_id_fkey";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_wind_speed_unit_id_fkey";

alter table "public"."areawide_adulticiding" drop constraint "temperature_unit";

alter table "public"."areawide_adulticiding" drop constraint "valid_time_range";

alter table "public"."areawide_adulticiding" drop constraint "wind_speed_unit";

alter table "public"."catch_basin_missions" drop constraint "positive_basin_count";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_address_id_fkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_created_by_fkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_group_id_fkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_temperature_unit_id_fkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_updated_by_fkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_wind_speed_unit_id_fkey";

alter table "public"."hand_ulvs" drop constraint "unit_for_temperature";

alter table "public"."hand_ulvs" drop constraint "unit_for_wind_speed";

alter table "public"."inspections" drop constraint "data_integrity";

alter table "public"."inspections" drop constraint "inspections_habitat_id_fkey";

alter table "public"."inspections" drop constraint "source_reduction_notes_check";

alter table "public"."landing_rates" drop constraint "unit_for_temperature";

alter table "public"."point_larviciding" drop constraint "area_and_unit";

alter table "public"."point_larviciding" drop constraint "point_larviciding_application_area_unit_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_application_equipment_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_application_method_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_created_by_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_group_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_habitat_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_inspection_id_fkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_updated_by_fkey";

alter table "public"."applications" drop constraint "applications_application_unit_id_fkey";

alter table "public"."applications" drop constraint "applications_applicator_id_fkey";

alter table "public"."applications" drop constraint "applications_batch_id_fkey";

alter table "public"."applications" drop constraint "one_originating_table";

alter table "public"."inspections" drop constraint "inspections_inspected_by_fkey";

alter table "public"."landing_rates" drop constraint "landing_rates_address_id_fkey";

alter table "public"."landing_rates" drop constraint "landing_rates_landing_rate_by_fkey";

alter table "public"."ulv_missions" drop constraint "completion_date_after_mission_date";

alter table "public"."ulv_missions" drop constraint "rain_date_after_mission_date";

alter table "public"."areawide_adulticiding" drop constraint "areawide_adulticiding_pkey";

alter table "public"."hand_ulvs" drop constraint "hand_ulvs_pkey";

alter table "public"."point_larviciding" drop constraint "point_larviciding_pkey";

drop index if exists "public"."areawide_adulticiding_pkey";

drop index if exists "public"."hand_ulvs_pkey";

drop index if exists "public"."idx_addresses_geom";

drop index if exists "public"."idx_aerial_sites_geom";

drop index if exists "public"."idx_areawide_adulticiding_geom";

drop index if exists "public"."idx_catch_basin_missions_geom";

drop index if exists "public"."idx_habitats_geom";

drop index if exists "public"."idx_regions_geom";

drop index if exists "public"."idx_traps_geom";

drop index if exists "public"."idx_ulv_missions_geom";

drop index if exists "public"."point_larviciding_pkey";

drop table "public"."areawide_adulticiding";

drop table "public"."hand_ulvs";

drop table "public"."point_larviciding";


  create table "public"."handheld_applications" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "feature_id" uuid,
    "address_id" uuid,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "start_temperature" integer,
    "end_temperature" integer,
    "temperature_unit_id" uuid,
    "start_wind_speed" double precision,
    "end_wind_speed" double precision,
    "wind_speed_unit_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."handheld_applications" enable row level security;


  create table "public"."inspection_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "inspection_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."inspection_tags" enable row level security;


  create table "public"."spatial_features" (
    "id" uuid not null default gen_random_uuid(),
    "geom" extensions.geometry(Geometry,4326) not null,
    "created_at" timestamp with time zone not null default now(),
    "lat" double precision generated always as (extensions.st_y(extensions.st_centroid(geom))) stored,
    "lng" double precision generated always as (extensions.st_x(extensions.st_centroid(geom))) stored,
    "geojson" jsonb generated always as ((extensions.st_asgeojson(geom))::jsonb) stored
      );


alter table "public"."spatial_features" enable row level security;


  create table "public"."truck_applications" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "feature_id" uuid,
    "area_description" text,
    "start_time" time without time zone,
    "start_odometer" double precision,
    "start_temperature" double precision,
    "start_wind_speed" double precision,
    "end_time" time without time zone,
    "end_odometer" double precision,
    "end_temperature" double precision,
    "end_wind_speed" double precision,
    "vehicle_id" uuid,
    "temperature_unit_id" uuid,
    "wind_speed_unit_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."truck_applications" enable row level security;

alter table "public"."addresses" drop column "geom";
alter table "public"."addresses" drop column "lat";
alter table "public"."addresses" drop column "lng";
alter table "public"."addresses" add column "feature_id" uuid not null;

alter table "public"."aerial_sites" drop column "geom";
alter table "public"."aerial_sites" drop column "geojson";
alter table "public"."aerial_sites" add column "feature_id" uuid not null;

alter table "public"."applications" drop column "areawide_adulticiding_id";
alter table "public"."applications" drop column "hand_ulv_id";
alter table "public"."applications" drop column "point_larviciding_id";
alter table "public"."applications" add column "application_method_id" uuid;
alter table "public"."applications" add column "equipment_id" uuid;
alter table "public"."applications" add column "feature_id" uuid;
alter table "public"."applications" add column "handheld_applications_id" uuid;
alter table "public"."applications" add column "inspection_id" uuid;
alter table "public"."applications" add column "truck_applications" uuid;

alter table "public"."catch_basin_missions" drop column "geom";
alter table "public"."catch_basin_missions" drop column "geojson";
alter table "public"."catch_basin_missions" add column "feature_id" uuid;

alter table "public"."catch_basin_missions" alter column "sample_dry" set data type smallint using "sample_dry"::smallint;
alter table "public"."catch_basin_missions" alter column "sample_wet" set data type smallint using "sample_wet"::smallint;

alter table "public"."groups" add column "settings" jsonb;

alter table "public"."habitats" drop column "geom";
alter table "public"."habitats" drop column "lat";
alter table "public"."habitats" drop column "lng";
alter table "public"."habitats" add column "feature_id" uuid not null;

alter table "public"."inspections" add column "feature_id" uuid not null;
alter table "public"."inspections" alter column "dip_count" set data type smallint using "dip_count"::smallint;
alter table "public"."inspections" alter column "habitat_id" drop not null;
alter table "public"."inspections" alter column "inspected_by" set not null;

alter table "public"."landing_rates" drop column "geom";
alter table "public"."landing_rates" drop column "lat";
alter table "public"."landing_rates" drop column "lng";

alter table "public"."landing_rates" drop column "sample_id";
alter table "public"."landing_rates" add column "feature_id" uuid not null;
alter table "public"."landing_rates" add column "sample_name" text;
alter table "public"."landing_rates" alter column "landing_rate_by" set not null;
alter table "public"."landing_rates" alter column "observed_count" set default 0;

alter table "public"."regions" drop column "geom";
alter table "public"."regions" drop column "geojson";
alter table "public"."regions" add column "feature_id" uuid not null;

alter table "public"."service_requests" drop column "display_number";
alter table "public"."service_requests" drop column "source";
alter table "public"."service_requests" add column "display_name" integer not null;
alter table "public"."service_requests" add column "feature_id" uuid not null;
alter table "public"."service_requests" add column "intake_type" public.request_intake_type not null default 'online'::public.request_intake_type;

alter table "public"."traps" drop column "geom";
alter table "public"."traps" drop column "lat";
alter table "public"."traps" drop column "lng";
alter table "public"."traps" add column "feature_id" uuid not null;

alter table "public"."ulv_missions" drop column "end_time";
alter table "public"."ulv_missions" drop column "geom";
alter table "public"."ulv_missions" drop column "geojson";
alter table "public"."ulv_missions" drop column "mission_date";
alter table "public"."ulv_missions" drop column "start_time";
alter table "public"."ulv_missions" add column "end_at" timestamp with time zone not null;
alter table "public"."ulv_missions" add column "feature_id" uuid;
alter table "public"."ulv_missions" add column "start_at" timestamp with time zone not null;

drop type "public"."service_request_source";

CREATE UNIQUE INDEX handheld_applications_pkey ON public.handheld_applications USING btree (id);

CREATE INDEX idx_spatial_features_gist_geom ON public.spatial_features USING gist (geom);

CREATE UNIQUE INDEX idx_spatial_features_unique_geom_hash ON public.spatial_features USING btree (md5(extensions.st_asbinary(geom)));

CREATE UNIQUE INDEX inspection_tags_pkey ON public.inspection_tags USING btree (id);

CREATE UNIQUE INDEX spatial_features_pkey ON public.spatial_features USING btree (id);

CREATE UNIQUE INDEX truck_applications_pkey ON public.truck_applications USING btree (id);

CREATE UNIQUE INDEX unique_inspection_and_tag ON public.inspection_tags USING btree (inspection_id, tag_id);

alter table "public"."handheld_applications" add constraint "handheld_applications_pkey" PRIMARY KEY using index "handheld_applications_pkey";

alter table "public"."inspection_tags" add constraint "inspection_tags_pkey" PRIMARY KEY using index "inspection_tags_pkey";

alter table "public"."spatial_features" add constraint "spatial_features_pkey" PRIMARY KEY using index "spatial_features_pkey";

alter table "public"."truck_applications" add constraint "truck_applications_pkey" PRIMARY KEY using index "truck_applications_pkey";

alter table "public"."addresses" add constraint "addresses_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."addresses" validate constraint "addresses_feature_id_fkey";

alter table "public"."aerial_sites" add constraint "aerial_sites_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_sites" validate constraint "aerial_sites_feature_id_fkey";

alter table "public"."applications" add constraint "applications_application_method_id_fkey" FOREIGN KEY (application_method_id) REFERENCES public.application_methods(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_application_method_id_fkey";

alter table "public"."applications" add constraint "applications_check" CHECK ((((((((inspection_id IS NOT NULL))::integer + ((flight_aerial_site_id IS NOT NULL))::integer) + ((catch_basin_mission_id IS NOT NULL))::integer) + ((truck_applications IS NOT NULL))::integer) + ((handheld_applications_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."applications" validate constraint "applications_check";

alter table "public"."applications" add constraint "applications_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_equipment_id_fkey";

alter table "public"."applications" add constraint "applications_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_feature_id_fkey";

alter table "public"."applications" add constraint "applications_handheld_applications_id_fkey" FOREIGN KEY (handheld_applications_id) REFERENCES public.handheld_applications(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_handheld_applications_id_fkey";

alter table "public"."applications" add constraint "applications_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_inspection_id_fkey";

alter table "public"."applications" add constraint "applications_truck_applications_fkey" FOREIGN KEY (truck_applications) REFERENCES public.truck_applications(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_truck_applications_fkey";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_check" CHECK ((basin_count > 0)) not valid;

alter table "public"."catch_basin_missions" validate constraint "catch_basin_missions_check";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."catch_basin_missions" validate constraint "catch_basin_missions_feature_id_fkey";

alter table "public"."habitats" add constraint "habitats_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."habitats" validate constraint "habitats_feature_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_address_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_created_by_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_feature_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_group_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_temperature_unit_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_updated_by_fkey";

alter table "public"."handheld_applications" add constraint "handheld_applications_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."handheld_applications" validate constraint "handheld_applications_wind_speed_unit_id_fkey";

alter table "public"."handheld_applications" add constraint "handheld_temp_unit_check" CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))) not valid;

alter table "public"."handheld_applications" validate constraint "handheld_temp_unit_check";

alter table "public"."handheld_applications" add constraint "handheld_wind_unit_check" CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))) not valid;

alter table "public"."handheld_applications" validate constraint "handheld_wind_unit_check";

alter table "public"."inspection_tags" add constraint "inspection_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."inspection_tags" validate constraint "inspection_tags_created_by_fkey";

alter table "public"."inspection_tags" add constraint "inspection_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspection_tags" validate constraint "inspection_tags_group_id_fkey";

alter table "public"."inspection_tags" add constraint "inspection_tags_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."inspection_tags" validate constraint "inspection_tags_inspection_id_fkey";

alter table "public"."inspection_tags" add constraint "inspection_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."inspection_tags" validate constraint "inspection_tags_tag_id_fkey";

alter table "public"."inspection_tags" add constraint "inspection_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."inspection_tags" validate constraint "inspection_tags_updated_by_fkey";

alter table "public"."inspection_tags" add constraint "unique_inspection_and_tag" UNIQUE using index "unique_inspection_and_tag";

alter table "public"."inspections" add constraint "inspections_check" CHECK (((is_wet = false) OR (((larvae_count IS NOT NULL) AND (dip_count IS NOT NULL)) OR (density_id IS NOT NULL) OR ((larvae_count IS NULL) AND (density_id IS NULL))))) not valid;

alter table "public"."inspections" validate constraint "inspections_check";

alter table "public"."inspections" add constraint "inspections_check_1" CHECK (((is_source_reduction = false) OR ((source_reduction_notes IS NOT NULL) AND (source_reduction_notes <> ''::text)))) not valid;

alter table "public"."inspections" validate constraint "inspections_check_1";

alter table "public"."inspections" add constraint "inspections_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_feature_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_check" CHECK ((((temperature_unit_id IS NULL) AND (temperature IS NULL)) OR ((temperature_unit_id IS NOT NULL) AND (temperature IS NOT NULL)))) not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_check";

alter table "public"."landing_rates" add constraint "landing_rates_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_feature_id_fkey";

alter table "public"."regions" add constraint "regions_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."regions" validate constraint "regions_feature_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_feature_id_fkey";

alter table "public"."traps" add constraint "traps_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_feature_id_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_created_by_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_feature_id_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_group_id_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_temp_check" CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))) not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_temp_check";

alter table "public"."truck_applications" add constraint "truck_applications_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_temperature_unit_id_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_updated_by_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_vehicle_id_fkey";

alter table "public"."truck_applications" add constraint "truck_applications_wind_check" CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))) not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_wind_check";

alter table "public"."truck_applications" add constraint "truck_applications_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_applications" validate constraint "truck_applications_wind_speed_unit_id_fkey";

alter table "public"."truck_applications" add constraint "valid_time_range" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time))) not valid;

alter table "public"."truck_applications" validate constraint "valid_time_range";

alter table "public"."ulv_missions" add constraint "ulv_missions_feature_id_fkey" FOREIGN KEY (feature_id) REFERENCES public.spatial_features(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."ulv_missions" validate constraint "ulv_missions_feature_id_fkey";

alter table "public"."applications" add constraint "applications_application_unit_id_fkey" FOREIGN KEY (application_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_application_unit_id_fkey";

alter table "public"."applications" add constraint "applications_applicator_id_fkey" FOREIGN KEY (applicator_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_applicator_id_fkey";

alter table "public"."applications" add constraint "applications_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.insecticide_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_batch_id_fkey";

alter table "public"."applications" add constraint "one_originating_table" CHECK ((((((((inspection_id IS NOT NULL))::integer + ((flight_aerial_site_id IS NOT NULL))::integer) + ((catch_basin_mission_id IS NOT NULL))::integer) + ((truck_applications IS NOT NULL))::integer) + ((handheld_applications_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."applications" validate constraint "one_originating_table";

alter table "public"."inspections" add constraint "inspections_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_inspected_by_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_address_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_landing_rate_by_fkey" FOREIGN KEY (landing_rate_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_landing_rate_by_fkey";

alter table "public"."ulv_missions" add constraint "completion_date_after_mission_date" CHECK (((completion_date IS NULL) OR (completion_date >= start_at))) not valid;

alter table "public"."ulv_missions" validate constraint "completion_date_after_mission_date";

alter table "public"."ulv_missions" add constraint "rain_date_after_mission_date" CHECK (((rain_date IS NULL) OR (rain_date > start_at))) not valid;

alter table "public"."ulv_missions" validate constraint "rain_date_after_mission_date";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_or_create_spatial_feature(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_geojson jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_geom extensions.geometry(Geometry, 4326);
    v_feature_id uuid;
    v_hash text;
BEGIN
    -- 1. Construct and FORCE TO 2D
    IF p_geojson IS NOT NULL THEN
        v_geom := extensions.ST_Force2D(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(
            CASE 
                WHEN (p_geojson->'geometry') IS NOT NULL THEN (p_geojson->'geometry')::text 
                ELSE p_geojson::text 
            END
        ), 4326));
    ELSIF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_geom := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326);
    ELSE
        RAISE EXCEPTION 'Missing spatial input: Provide lat/lng or geojson.';
    END IF;

    -- 2. Enforcement: Snap to 6 decimals
    v_geom := extensions.ST_SnapToGrid(v_geom, 0.000001);
    v_hash := md5(extensions.ST_AsBinary(v_geom));

    -- 3. Atomic De-duplication using the HASH
    INSERT INTO public.spatial_features (geom)
    VALUES (v_geom)
    ON CONFLICT (md5(extensions.ST_AsBinary(geom))) DO NOTHING;

    -- 4. Return the ID
    SELECT id INTO v_feature_id 
    FROM public.spatial_features 
    WHERE md5(extensions.ST_AsBinary(geom)) = v_hash;

    RETURN v_feature_id;
END;
$function$
;

grant delete on table "public"."handheld_applications" to "anon";

grant insert on table "public"."handheld_applications" to "anon";

grant references on table "public"."handheld_applications" to "anon";

grant select on table "public"."handheld_applications" to "anon";

grant trigger on table "public"."handheld_applications" to "anon";

grant truncate on table "public"."handheld_applications" to "anon";

grant update on table "public"."handheld_applications" to "anon";

grant delete on table "public"."handheld_applications" to "authenticated";

grant insert on table "public"."handheld_applications" to "authenticated";

grant references on table "public"."handheld_applications" to "authenticated";

grant select on table "public"."handheld_applications" to "authenticated";

grant trigger on table "public"."handheld_applications" to "authenticated";

grant truncate on table "public"."handheld_applications" to "authenticated";

grant update on table "public"."handheld_applications" to "authenticated";

grant delete on table "public"."handheld_applications" to "service_role";

grant insert on table "public"."handheld_applications" to "service_role";

grant references on table "public"."handheld_applications" to "service_role";

grant select on table "public"."handheld_applications" to "service_role";

grant trigger on table "public"."handheld_applications" to "service_role";

grant truncate on table "public"."handheld_applications" to "service_role";

grant update on table "public"."handheld_applications" to "service_role";

grant delete on table "public"."inspection_tags" to "anon";

grant insert on table "public"."inspection_tags" to "anon";

grant references on table "public"."inspection_tags" to "anon";

grant select on table "public"."inspection_tags" to "anon";

grant trigger on table "public"."inspection_tags" to "anon";

grant truncate on table "public"."inspection_tags" to "anon";

grant update on table "public"."inspection_tags" to "anon";

grant delete on table "public"."inspection_tags" to "authenticated";

grant insert on table "public"."inspection_tags" to "authenticated";

grant references on table "public"."inspection_tags" to "authenticated";

grant select on table "public"."inspection_tags" to "authenticated";

grant trigger on table "public"."inspection_tags" to "authenticated";

grant truncate on table "public"."inspection_tags" to "authenticated";

grant update on table "public"."inspection_tags" to "authenticated";

grant delete on table "public"."inspection_tags" to "service_role";

grant insert on table "public"."inspection_tags" to "service_role";

grant references on table "public"."inspection_tags" to "service_role";

grant select on table "public"."inspection_tags" to "service_role";

grant trigger on table "public"."inspection_tags" to "service_role";

grant truncate on table "public"."inspection_tags" to "service_role";

grant update on table "public"."inspection_tags" to "service_role";

grant delete on table "public"."spatial_features" to "anon";

grant insert on table "public"."spatial_features" to "anon";

grant references on table "public"."spatial_features" to "anon";

grant select on table "public"."spatial_features" to "anon";

grant trigger on table "public"."spatial_features" to "anon";

grant truncate on table "public"."spatial_features" to "anon";

grant update on table "public"."spatial_features" to "anon";

grant delete on table "public"."spatial_features" to "authenticated";

grant insert on table "public"."spatial_features" to "authenticated";

grant references on table "public"."spatial_features" to "authenticated";

grant select on table "public"."spatial_features" to "authenticated";

grant trigger on table "public"."spatial_features" to "authenticated";

grant truncate on table "public"."spatial_features" to "authenticated";

grant update on table "public"."spatial_features" to "authenticated";

grant delete on table "public"."spatial_features" to "service_role";

grant insert on table "public"."spatial_features" to "service_role";

grant references on table "public"."spatial_features" to "service_role";

grant select on table "public"."spatial_features" to "service_role";

grant trigger on table "public"."spatial_features" to "service_role";

grant truncate on table "public"."spatial_features" to "service_role";

grant update on table "public"."spatial_features" to "service_role";

grant delete on table "public"."truck_applications" to "anon";

grant insert on table "public"."truck_applications" to "anon";

grant references on table "public"."truck_applications" to "anon";

grant select on table "public"."truck_applications" to "anon";

grant trigger on table "public"."truck_applications" to "anon";

grant truncate on table "public"."truck_applications" to "anon";

grant update on table "public"."truck_applications" to "anon";

grant delete on table "public"."truck_applications" to "authenticated";

grant insert on table "public"."truck_applications" to "authenticated";

grant references on table "public"."truck_applications" to "authenticated";

grant select on table "public"."truck_applications" to "authenticated";

grant trigger on table "public"."truck_applications" to "authenticated";

grant truncate on table "public"."truck_applications" to "authenticated";

grant update on table "public"."truck_applications" to "authenticated";

grant delete on table "public"."truck_applications" to "service_role";

grant insert on table "public"."truck_applications" to "service_role";

grant references on table "public"."truck_applications" to "service_role";

grant select on table "public"."truck_applications" to "service_role";

grant trigger on table "public"."truck_applications" to "service_role";

grant truncate on table "public"."truck_applications" to "service_role";

grant update on table "public"."truck_applications" to "service_role";


  create policy "delete: own group manager or own records"
  on "public"."handheld_applications"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."handheld_applications"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."handheld_applications"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."handheld_applications"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager or own records"
  on "public"."inspection_tags"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."inspection_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."inspection_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."inspection_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: none"
  on "public"."spatial_features"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "insert: all authenticated"
  on "public"."spatial_features"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "select: all authenticated"
  on "public"."spatial_features"
  as permissive
  for select
  to authenticated
using (true);



  create policy "update: none"
  on "public"."spatial_features"
  as permissive
  for update
  to authenticated
using (false);



  create policy "delete: own group manager or own records"
  on "public"."truck_applications"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."truck_applications"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."truck_applications"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."truck_applications"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));


CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.handheld_applications FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.handheld_applications FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.inspection_tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.inspection_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.truck_applications FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.truck_applications FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


