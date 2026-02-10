create type "public"."aerial_inspection_result" as enum ('recheck', 'fly', 'hand treat', 'no action');

create type "public"."service_request_source" as enum ('online', 'phone', 'walk-in', 'other');

create type "public"."species_sex" as enum ('male', 'female');

create type "public"."species_status" as enum ('damaged', 'unfed', 'bloodfed', 'gravid');

drop trigger if exists "handle_created_trigger" on "public"."additional_personnel";

drop trigger if exists "handle_updated_trigger" on "public"."additional_personnel";

drop trigger if exists "handle_created_trigger" on "public"."adulticide_missions";

drop trigger if exists "handle_updated_trigger" on "public"."adulticide_missions";

drop trigger if exists "refresh_mission_subdivisions_trigger" on "public"."adulticide_missions";

drop trigger if exists "soft_delete_trigger" on "public"."adulticide_missions";

drop trigger if exists "handle_created_trigger" on "public"."applications";

drop trigger if exists "handle_updated_trigger" on "public"."applications";

drop trigger if exists "handle_created_trigger" on "public"."collection_species";

drop trigger if exists "handle_updated_trigger" on "public"."collection_species";

drop trigger if exists "soft_delete_trigger" on "public"."collection_species";

drop trigger if exists "handle_created_trigger" on "public"."collections";

drop trigger if exists "handle_updated_trigger" on "public"."collections";

drop trigger if exists "handle_created_trigger" on "public"."comments";

drop trigger if exists "handle_updated_trigger" on "public"."comments";

drop trigger if exists "handle_created_trigger" on "public"."contacts";

drop trigger if exists "handle_updated_trigger" on "public"."contacts";

drop trigger if exists "soft_delete_trigger" on "public"."genera";

drop trigger if exists "created_by_trigger" on "public"."groups";

drop trigger if exists "handle_updated_trigger" on "public"."groups";

drop trigger if exists "handle_created_trigger" on "public"."habitat_tags";

drop trigger if exists "handle_updated_trigger" on "public"."habitat_tags";

drop trigger if exists "handle_created_trigger" on "public"."habitats";

drop trigger if exists "handle_updated_trigger" on "public"."habitats";

drop trigger if exists "handle_created_trigger" on "public"."insecticides";

drop trigger if exists "handle_updated_trigger" on "public"."insecticides";

drop trigger if exists "handle_created_trigger" on "public"."inspections";

drop trigger if exists "handle_updated_trigger" on "public"."inspections";

drop trigger if exists "handle_created_trigger" on "public"."larval_densities";

drop trigger if exists "handle_updated_trigger" on "public"."larval_densities";

drop trigger if exists "soft_delete_trigger" on "public"."larval_densities";

drop trigger if exists "handle_created_trigger" on "public"."locations";

drop trigger if exists "handle_updated_trigger" on "public"."locations";

drop trigger if exists "soft_delete_trigger" on "public"."locations";

drop trigger if exists "handle_created_trigger" on "public"."mission_applications";

drop trigger if exists "handle_updated_trigger" on "public"."mission_applications";

drop trigger if exists "soft_delete_trigger" on "public"."mission_applications";

drop trigger if exists "handle_created_trigger" on "public"."profiles";

drop trigger if exists "handle_updated_trigger" on "public"."profiles";

drop trigger if exists "handle_created_trigger" on "public"."region_tags";

drop trigger if exists "handle_updated_trigger" on "public"."region_tags";

drop trigger if exists "soft_delete_trigger" on "public"."region_tags";

drop trigger if exists "handle_created_trigger" on "public"."regions";

drop trigger if exists "handle_updated_trigger" on "public"."regions";

drop trigger if exists "refresh_region_subdivisions_trigger" on "public"."regions";

drop trigger if exists "handle_created_trigger" on "public"."service_request_tags";

drop trigger if exists "handle_updated_trigger" on "public"."service_request_tags";

drop trigger if exists "handle_created_trigger" on "public"."service_requests";

drop trigger if exists "handle_updated_trigger" on "public"."service_requests";

drop trigger if exists "soft_delete_trigger" on "public"."species";

drop trigger if exists "handle_created_trigger" on "public"."tag_groups";

drop trigger if exists "handle_updated_trigger" on "public"."tag_groups";

drop trigger if exists "soft_delete_trigger" on "public"."tag_groups";

drop trigger if exists "handle_created_trigger" on "public"."tags";

drop trigger if exists "handle_updated_trigger" on "public"."tags";

drop trigger if exists "handle_created_trigger" on "public"."trap_lures";

drop trigger if exists "handle_updated_trigger" on "public"."trap_lures";

drop trigger if exists "handle_created_trigger" on "public"."trap_tags";

drop trigger if exists "handle_updated_trigger" on "public"."trap_tags";

drop trigger if exists "handle_created_trigger" on "public"."trap_types";

drop trigger if exists "handle_updated_trigger" on "public"."trap_types";

drop trigger if exists "handle_created_trigger" on "public"."traps";

drop trigger if exists "handle_updated_trigger" on "public"."traps";

drop trigger if exists "soft_delete_trigger" on "public"."units";

drop policy "delete: own group manager" on "public"."adulticide_missions";

drop policy "insert: own group manager" on "public"."adulticide_missions";

drop policy "select: own groups or group_id is null" on "public"."adulticide_missions";

drop policy "update: own group manager" on "public"."adulticide_missions";

drop policy "delete: own groups collector" on "public"."collection_species";

drop policy "insert: own groups collector" on "public"."collection_species";

drop policy "select: own groups" on "public"."collection_species";

drop policy "update: own groups collector" on "public"."collection_species";

drop policy "delete: own group manager" on "public"."larval_densities";

drop policy "insert: own group manager" on "public"."larval_densities";

drop policy "select: own groups" on "public"."larval_densities";

drop policy "update: own group manager" on "public"."larval_densities";

drop policy "delete: own if collector, all if manager" on "public"."locations";

drop policy "insert: group collectors" on "public"."locations";

drop policy "select: group data" on "public"."locations";

drop policy "update: own if collector, all if manager" on "public"."locations";

drop policy "delete: own group manager or own records" on "public"."mission_applications";

drop policy "insert: own group collector" on "public"."mission_applications";

drop policy "select: own groups" on "public"."mission_applications";

drop policy "update: own group collector" on "public"."mission_applications";

drop policy "delete: own group manager" on "public"."mission_subdivisions";

drop policy "insert: own group manager" on "public"."mission_subdivisions";

drop policy "select: own groups" on "public"."mission_subdivisions";

drop policy "update: own group manager" on "public"."mission_subdivisions";

drop policy "delete: own group admin" on "public"."region_subdivisions";

drop policy "insert: own group admin" on "public"."region_subdivisions";

drop policy "select: own groups" on "public"."region_subdivisions";

drop policy "update: own group admin" on "public"."region_subdivisions";

drop policy "delete: group admin" on "public"."region_tags";

drop policy "insert: group admin" on "public"."region_tags";

drop policy "select: group data" on "public"."region_tags";

drop policy "update: group admin" on "public"."region_tags";

drop policy "delete: own group admin" on "public"."tag_groups";

drop policy "insert: own group admin" on "public"."tag_groups";

drop policy "select: own groups or group_id is null" on "public"."tag_groups";

drop policy "update: own group admin" on "public"."tag_groups";

drop policy "select: own groups or group_id is null" on "public"."trap_lures";

drop policy "select: own groups or group_id is null" on "public"."trap_types";

drop policy "insert: group owners" on "public"."profiles";

revoke delete on table "public"."adulticide_missions" from "anon";

revoke insert on table "public"."adulticide_missions" from "anon";

revoke references on table "public"."adulticide_missions" from "anon";

revoke select on table "public"."adulticide_missions" from "anon";

revoke trigger on table "public"."adulticide_missions" from "anon";

revoke truncate on table "public"."adulticide_missions" from "anon";

revoke update on table "public"."adulticide_missions" from "anon";

revoke delete on table "public"."adulticide_missions" from "authenticated";

revoke insert on table "public"."adulticide_missions" from "authenticated";

revoke references on table "public"."adulticide_missions" from "authenticated";

revoke select on table "public"."adulticide_missions" from "authenticated";

revoke trigger on table "public"."adulticide_missions" from "authenticated";

revoke truncate on table "public"."adulticide_missions" from "authenticated";

revoke update on table "public"."adulticide_missions" from "authenticated";

revoke delete on table "public"."adulticide_missions" from "service_role";

revoke insert on table "public"."adulticide_missions" from "service_role";

revoke references on table "public"."adulticide_missions" from "service_role";

revoke select on table "public"."adulticide_missions" from "service_role";

revoke trigger on table "public"."adulticide_missions" from "service_role";

revoke truncate on table "public"."adulticide_missions" from "service_role";

revoke update on table "public"."adulticide_missions" from "service_role";

revoke delete on table "public"."collection_species" from "anon";

revoke insert on table "public"."collection_species" from "anon";

revoke references on table "public"."collection_species" from "anon";

revoke select on table "public"."collection_species" from "anon";

revoke trigger on table "public"."collection_species" from "anon";

revoke truncate on table "public"."collection_species" from "anon";

revoke update on table "public"."collection_species" from "anon";

revoke delete on table "public"."collection_species" from "authenticated";

revoke insert on table "public"."collection_species" from "authenticated";

revoke references on table "public"."collection_species" from "authenticated";

revoke select on table "public"."collection_species" from "authenticated";

revoke trigger on table "public"."collection_species" from "authenticated";

revoke truncate on table "public"."collection_species" from "authenticated";

revoke update on table "public"."collection_species" from "authenticated";

revoke delete on table "public"."collection_species" from "service_role";

revoke insert on table "public"."collection_species" from "service_role";

revoke references on table "public"."collection_species" from "service_role";

revoke select on table "public"."collection_species" from "service_role";

revoke trigger on table "public"."collection_species" from "service_role";

revoke truncate on table "public"."collection_species" from "service_role";

revoke update on table "public"."collection_species" from "service_role";

revoke delete on table "public"."larval_densities" from "anon";

revoke insert on table "public"."larval_densities" from "anon";

revoke references on table "public"."larval_densities" from "anon";

revoke select on table "public"."larval_densities" from "anon";

revoke trigger on table "public"."larval_densities" from "anon";

revoke truncate on table "public"."larval_densities" from "anon";

revoke update on table "public"."larval_densities" from "anon";

revoke delete on table "public"."larval_densities" from "authenticated";

revoke insert on table "public"."larval_densities" from "authenticated";

revoke references on table "public"."larval_densities" from "authenticated";

revoke select on table "public"."larval_densities" from "authenticated";

revoke trigger on table "public"."larval_densities" from "authenticated";

revoke truncate on table "public"."larval_densities" from "authenticated";

revoke update on table "public"."larval_densities" from "authenticated";

revoke delete on table "public"."larval_densities" from "service_role";

revoke insert on table "public"."larval_densities" from "service_role";

revoke references on table "public"."larval_densities" from "service_role";

revoke select on table "public"."larval_densities" from "service_role";

revoke trigger on table "public"."larval_densities" from "service_role";

revoke truncate on table "public"."larval_densities" from "service_role";

revoke update on table "public"."larval_densities" from "service_role";

revoke delete on table "public"."locations" from "anon";

revoke insert on table "public"."locations" from "anon";

revoke references on table "public"."locations" from "anon";

revoke select on table "public"."locations" from "anon";

revoke trigger on table "public"."locations" from "anon";

revoke truncate on table "public"."locations" from "anon";

revoke update on table "public"."locations" from "anon";

revoke delete on table "public"."locations" from "authenticated";

revoke insert on table "public"."locations" from "authenticated";

revoke references on table "public"."locations" from "authenticated";

revoke select on table "public"."locations" from "authenticated";

revoke trigger on table "public"."locations" from "authenticated";

revoke truncate on table "public"."locations" from "authenticated";

revoke update on table "public"."locations" from "authenticated";

revoke delete on table "public"."locations" from "service_role";

revoke insert on table "public"."locations" from "service_role";

revoke references on table "public"."locations" from "service_role";

revoke select on table "public"."locations" from "service_role";

revoke trigger on table "public"."locations" from "service_role";

revoke truncate on table "public"."locations" from "service_role";

revoke update on table "public"."locations" from "service_role";

revoke delete on table "public"."mission_applications" from "anon";

revoke insert on table "public"."mission_applications" from "anon";

revoke references on table "public"."mission_applications" from "anon";

revoke select on table "public"."mission_applications" from "anon";

revoke trigger on table "public"."mission_applications" from "anon";

revoke truncate on table "public"."mission_applications" from "anon";

revoke update on table "public"."mission_applications" from "anon";

revoke delete on table "public"."mission_applications" from "authenticated";

revoke insert on table "public"."mission_applications" from "authenticated";

revoke references on table "public"."mission_applications" from "authenticated";

revoke select on table "public"."mission_applications" from "authenticated";

revoke trigger on table "public"."mission_applications" from "authenticated";

revoke truncate on table "public"."mission_applications" from "authenticated";

revoke update on table "public"."mission_applications" from "authenticated";

revoke delete on table "public"."mission_applications" from "service_role";

revoke insert on table "public"."mission_applications" from "service_role";

revoke references on table "public"."mission_applications" from "service_role";

revoke select on table "public"."mission_applications" from "service_role";

revoke trigger on table "public"."mission_applications" from "service_role";

revoke truncate on table "public"."mission_applications" from "service_role";

revoke update on table "public"."mission_applications" from "service_role";

revoke delete on table "public"."mission_subdivisions" from "anon";

revoke insert on table "public"."mission_subdivisions" from "anon";

revoke references on table "public"."mission_subdivisions" from "anon";

revoke select on table "public"."mission_subdivisions" from "anon";

revoke trigger on table "public"."mission_subdivisions" from "anon";

revoke truncate on table "public"."mission_subdivisions" from "anon";

revoke update on table "public"."mission_subdivisions" from "anon";

revoke delete on table "public"."mission_subdivisions" from "authenticated";

revoke insert on table "public"."mission_subdivisions" from "authenticated";

revoke references on table "public"."mission_subdivisions" from "authenticated";

revoke select on table "public"."mission_subdivisions" from "authenticated";

revoke trigger on table "public"."mission_subdivisions" from "authenticated";

revoke truncate on table "public"."mission_subdivisions" from "authenticated";

revoke update on table "public"."mission_subdivisions" from "authenticated";

revoke delete on table "public"."mission_subdivisions" from "service_role";

revoke insert on table "public"."mission_subdivisions" from "service_role";

revoke references on table "public"."mission_subdivisions" from "service_role";

revoke select on table "public"."mission_subdivisions" from "service_role";

revoke trigger on table "public"."mission_subdivisions" from "service_role";

revoke truncate on table "public"."mission_subdivisions" from "service_role";

revoke update on table "public"."mission_subdivisions" from "service_role";

revoke delete on table "public"."region_subdivisions" from "anon";

revoke insert on table "public"."region_subdivisions" from "anon";

revoke references on table "public"."region_subdivisions" from "anon";

revoke select on table "public"."region_subdivisions" from "anon";

revoke trigger on table "public"."region_subdivisions" from "anon";

revoke truncate on table "public"."region_subdivisions" from "anon";

revoke update on table "public"."region_subdivisions" from "anon";

revoke delete on table "public"."region_subdivisions" from "authenticated";

revoke insert on table "public"."region_subdivisions" from "authenticated";

revoke references on table "public"."region_subdivisions" from "authenticated";

revoke select on table "public"."region_subdivisions" from "authenticated";

revoke trigger on table "public"."region_subdivisions" from "authenticated";

revoke truncate on table "public"."region_subdivisions" from "authenticated";

revoke update on table "public"."region_subdivisions" from "authenticated";

revoke delete on table "public"."region_subdivisions" from "service_role";

revoke insert on table "public"."region_subdivisions" from "service_role";

revoke references on table "public"."region_subdivisions" from "service_role";

revoke select on table "public"."region_subdivisions" from "service_role";

revoke trigger on table "public"."region_subdivisions" from "service_role";

revoke truncate on table "public"."region_subdivisions" from "service_role";

revoke update on table "public"."region_subdivisions" from "service_role";

revoke delete on table "public"."region_tags" from "anon";

revoke insert on table "public"."region_tags" from "anon";

revoke references on table "public"."region_tags" from "anon";

revoke select on table "public"."region_tags" from "anon";

revoke trigger on table "public"."region_tags" from "anon";

revoke truncate on table "public"."region_tags" from "anon";

revoke update on table "public"."region_tags" from "anon";

revoke delete on table "public"."region_tags" from "authenticated";

revoke insert on table "public"."region_tags" from "authenticated";

revoke references on table "public"."region_tags" from "authenticated";

revoke select on table "public"."region_tags" from "authenticated";

revoke trigger on table "public"."region_tags" from "authenticated";

revoke truncate on table "public"."region_tags" from "authenticated";

revoke update on table "public"."region_tags" from "authenticated";

revoke delete on table "public"."region_tags" from "service_role";

revoke insert on table "public"."region_tags" from "service_role";

revoke references on table "public"."region_tags" from "service_role";

revoke select on table "public"."region_tags" from "service_role";

revoke trigger on table "public"."region_tags" from "service_role";

revoke truncate on table "public"."region_tags" from "service_role";

revoke update on table "public"."region_tags" from "service_role";

alter table "public"."additional_personnel" drop constraint "additional_personnel_mission_applications_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_profile_id_fkey";

alter table "public"."adulticide_missions" drop constraint "adulticide_missions_adulticide_id_fkey";

alter table "public"."adulticide_missions" drop constraint "adulticide_missions_created_by_fkey";

alter table "public"."adulticide_missions" drop constraint "adulticide_missions_group_id_fkey";

alter table "public"."adulticide_missions" drop constraint "adulticide_missions_updated_by_fkey";

alter table "public"."applications" drop constraint "applications_mission_applications_id_fkey";

alter table "public"."collection_species" drop constraint "collection_species_collection_id_fkey";

alter table "public"."collection_species" drop constraint "collection_species_created_by_fkey";

alter table "public"."collection_species" drop constraint "collection_species_group_id_fkey";

alter table "public"."collection_species" drop constraint "collection_species_identified_by_fkey";

alter table "public"."collection_species" drop constraint "collection_species_species_id_fkey";

alter table "public"."collection_species" drop constraint "collection_species_updated_by_fkey";

alter table "public"."collection_species" drop constraint "count_non_negative";

alter table "public"."comments" drop constraint "comments_adulticide_mission_id_fkey";

alter table "public"."comments" drop constraint "comments_habitat_id_fkey";

alter table "public"."comments" drop constraint "comments_mission_applications_id_fkey";

alter table "public"."habitats" drop constraint "habitats_location_id_fkey";

alter table "public"."insecticides" drop constraint "insecticide_name_unique";

alter table "public"."insecticides" drop constraint "insecticides_default_usage_unit_id_fkey";

alter table "public"."inspections" drop constraint "inspections_inspector_id_fkey";

alter table "public"."larval_densities" drop constraint "larval_densities_created_by_fkey";

alter table "public"."larval_densities" drop constraint "larval_densities_group_id_fkey";

alter table "public"."larval_densities" drop constraint "larval_densities_updated_by_fkey";

alter table "public"."larval_densities" drop constraint "range_valid";

alter table "public"."locations" drop constraint "locations_created_by_fkey";

alter table "public"."locations" drop constraint "locations_group_id_fkey";

alter table "public"."locations" drop constraint "locations_updated_by_fkey";

alter table "public"."mission_applications" drop constraint "mission_applications_adulticide_mission_id_fkey";

alter table "public"."mission_applications" drop constraint "mission_applications_applicator_id_fkey";

alter table "public"."mission_applications" drop constraint "mission_applications_created_by_fkey";

alter table "public"."mission_applications" drop constraint "mission_applications_group_id_fkey";

alter table "public"."mission_applications" drop constraint "mission_applications_updated_by_fkey";

alter table "public"."mission_subdivisions" drop constraint "mission_subdivisions_group_id_fkey";

alter table "public"."mission_subdivisions" drop constraint "mission_subdivisions_mission_id_fkey";

alter table "public"."profiles" drop constraint "profiles_user_id_fkey";

alter table "public"."region_subdivisions" drop constraint "region_subdivisions_group_id_fkey";

alter table "public"."region_subdivisions" drop constraint "region_subdivisions_region_id_fkey";

alter table "public"."region_tags" drop constraint "region_tag_unique";

alter table "public"."region_tags" drop constraint "region_tags_created_by_fkey";

alter table "public"."region_tags" drop constraint "region_tags_group_id_fkey";

alter table "public"."region_tags" drop constraint "region_tags_region_id_fkey";

alter table "public"."region_tags" drop constraint "region_tags_tag_id_fkey";

alter table "public"."region_tags" drop constraint "region_tags_updated_by_fkey";

alter table "public"."service_requests" drop constraint "service_requests_complainant_id_fkey";

alter table "public"."service_requests" drop constraint "service_requests_complainant_location_id_fkey";

alter table "public"."service_requests" drop constraint "service_requests_complaint_location_id_fkey";

alter table "public"."tag_groups" drop constraint "tag_groups_created_by_fkey";

alter table "public"."tag_groups" drop constraint "tag_groups_group_id_fkey";

alter table "public"."tag_groups" drop constraint "tag_groups_updated_by_fkey";

alter table "public"."traps" drop constraint "traps_location_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_created_by_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_group_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_inspection_id_fkey";

alter table "public"."additional_personnel" drop constraint "additional_personnel_updated_by_fkey";

alter table "public"."applications" drop constraint "applications_created_by_fkey";

alter table "public"."applications" drop constraint "applications_group_id_fkey";

alter table "public"."applications" drop constraint "applications_insecticide_id_fkey";

alter table "public"."applications" drop constraint "applications_inspection_id_fkey";

alter table "public"."applications" drop constraint "applications_updated_by_fkey";

alter table "public"."collections" drop constraint "collections_collected_by_fkey";

alter table "public"."collections" drop constraint "collections_created_by_fkey";

alter table "public"."collections" drop constraint "collections_group_id_fkey";

alter table "public"."collections" drop constraint "collections_trap_id_fkey";

alter table "public"."collections" drop constraint "collections_trap_lure_id_fkey";

alter table "public"."collections" drop constraint "collections_trap_set_by_fkey";

alter table "public"."collections" drop constraint "collections_updated_by_fkey";

alter table "public"."comments" drop constraint "comments_collection_id_fkey";

alter table "public"."comments" drop constraint "comments_created_by_fkey";

alter table "public"."comments" drop constraint "comments_group_id_fkey";

alter table "public"."comments" drop constraint "comments_parent_id_fkey";

alter table "public"."comments" drop constraint "comments_service_request_id_fkey";

alter table "public"."comments" drop constraint "comments_updated_by_fkey";

alter table "public"."contacts" drop constraint "contacts_created_by_fkey";

alter table "public"."contacts" drop constraint "contacts_group_id_fkey";

alter table "public"."contacts" drop constraint "contacts_updated_by_fkey";

alter table "public"."groups" drop constraint "groups_created_by_fkey";

alter table "public"."groups" drop constraint "groups_updated_by_fkey";

alter table "public"."habitat_tags" drop constraint "habitat_tags_created_by_fkey";

alter table "public"."habitat_tags" drop constraint "habitat_tags_group_id_fkey";

alter table "public"."habitat_tags" drop constraint "habitat_tags_updated_by_fkey";

alter table "public"."habitats" drop constraint "habitats_created_by_fkey";

alter table "public"."habitats" drop constraint "habitats_group_id_fkey";

alter table "public"."habitats" drop constraint "habitats_updated_by_fkey";

alter table "public"."insecticides" drop constraint "insecticides_created_by_fkey";

alter table "public"."insecticides" drop constraint "insecticides_group_id_fkey";

alter table "public"."insecticides" drop constraint "insecticides_updated_by_fkey";

alter table "public"."inspections" drop constraint "data_integrity";

alter table "public"."inspections" drop constraint "inspections_created_by_fkey";

alter table "public"."inspections" drop constraint "inspections_density_id_fkey";

alter table "public"."inspections" drop constraint "inspections_group_id_fkey";

alter table "public"."inspections" drop constraint "inspections_habitat_id_fkey";

alter table "public"."inspections" drop constraint "inspections_updated_by_fkey";

alter table "public"."profiles" drop constraint "profiles_created_by_fkey";

alter table "public"."profiles" drop constraint "profiles_group_id_fkey";

alter table "public"."profiles" drop constraint "profiles_role_id_fkey";

alter table "public"."profiles" drop constraint "profiles_updated_by_fkey";

alter table "public"."regions" drop constraint "regions_created_by_fkey";

alter table "public"."regions" drop constraint "regions_group_id_fkey";

alter table "public"."regions" drop constraint "regions_parent_id_fkey";

alter table "public"."regions" drop constraint "regions_updated_by_fkey";

alter table "public"."service_request_tags" drop constraint "service_request_tags_created_by_fkey";

alter table "public"."service_request_tags" drop constraint "service_request_tags_group_id_fkey";

alter table "public"."service_request_tags" drop constraint "service_request_tags_service_request_id_fkey";

alter table "public"."service_request_tags" drop constraint "service_request_tags_tag_id_fkey";

alter table "public"."service_request_tags" drop constraint "service_request_tags_updated_by_fkey";

alter table "public"."service_requests" drop constraint "service_requests_created_by_fkey";

alter table "public"."service_requests" drop constraint "service_requests_group_id_fkey";

alter table "public"."service_requests" drop constraint "service_requests_updated_by_fkey";

alter table "public"."species" drop constraint "species_genus_id_fkey";

alter table "public"."tags" drop constraint "name_unique";

alter table "public"."tags" drop constraint "tags_created_by_fkey";

alter table "public"."tags" drop constraint "tags_group_id_fkey";

alter table "public"."tags" drop constraint "tags_tag_group_id_fkey";

alter table "public"."tags" drop constraint "tags_updated_by_fkey";

alter table "public"."trap_lures" drop constraint "trap_lures_created_by_fkey";

alter table "public"."trap_lures" drop constraint "trap_lures_group_id_fkey";

alter table "public"."trap_lures" drop constraint "trap_lures_updated_by_fkey";

alter table "public"."trap_tags" drop constraint "trap_tags_created_by_fkey";

alter table "public"."trap_tags" drop constraint "trap_tags_updated_by_fkey";

alter table "public"."trap_types" drop constraint "trap_types_created_by_fkey";

alter table "public"."trap_types" drop constraint "trap_types_group_id_fkey";

alter table "public"."trap_types" drop constraint "trap_types_updated_by_fkey";

alter table "public"."traps" drop constraint "traps_created_by_fkey";

alter table "public"."traps" drop constraint "traps_group_id_fkey";

alter table "public"."traps" drop constraint "traps_trap_type_id_fkey";

alter table "public"."traps" drop constraint "traps_updated_by_fkey";

alter table "public"."units" drop constraint "units_base_unit_id_fkey";

drop function if exists "public"."set_updated_record_fields"();

drop function if exists "simmer"."refresh_mission_subdivisions"();

drop function if exists "simmer"."refresh_region_subdivisions"();

drop function if exists "simmer"."set_created_by"();

alter table "public"."adulticide_missions" drop constraint "adulticide_missions_pkey";

alter table "public"."collection_species" drop constraint "collection_species_pkey";

alter table "public"."larval_densities" drop constraint "larval_densities_pkey";

alter table "public"."locations" drop constraint "locations_pkey";

alter table "public"."mission_applications" drop constraint "mission_applications_pkey";

alter table "public"."mission_subdivisions" drop constraint "mission_subdivisions_pkey";

alter table "public"."region_subdivisions" drop constraint "region_subdivisions_pkey";

alter table "public"."region_tags" drop constraint "region_tags_pkey";

drop index if exists "public"."adulticide_missions_pkey";

drop index if exists "public"."collection_species_pkey";

drop index if exists "public"."idx_adulticide_missions_geom";

drop index if exists "public"."idx_locations_geom";

drop index if exists "public"."idx_mission_applications_geom";

drop index if exists "public"."idx_mission_subdivisions_geom";

drop index if exists "public"."idx_region_subdivisions_geom";

drop index if exists "public"."insecticide_name_unique";

drop index if exists "public"."larval_densities_pkey";

drop index if exists "public"."locations_pkey";

drop index if exists "public"."mission_applications_pkey";

drop index if exists "public"."mission_subdivisions_pkey";

drop index if exists "public"."region_subdivisions_pkey";

drop index if exists "public"."region_tag_unique";

drop index if exists "public"."region_tags_pkey";

drop index if exists "public"."name_unique";

drop table "public"."adulticide_missions";

drop table "public"."collection_species";

drop table "public"."larval_densities";

drop table "public"."locations";

drop table "public"."mission_applications";

drop table "public"."mission_subdivisions";

drop table "public"."region_subdivisions";

drop table "public"."region_tags";


  create table "public"."address_tags" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "address_id" uuid not null,
    "tag_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."address_tags" enable row level security;


  create table "public"."addresses" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "display_name" text not null,
    "address_fields" jsonb not null,
    "lat" double precision not null,
    "lng" double precision not null,
    "geom" extensions.geometry(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."addresses" enable row level security;


  create table "public"."aerial_inspections" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "aerial_site_id" uuid not null,
    "inspected_by" uuid,
    "inspection_date" date not null,
    "is_wet" boolean not null default false,
    "result" public.aerial_inspection_result not null,
    "density_id" uuid not null,
    "dips_count" integer not null,
    "larvae_count" integer,
    "larvae_per_dip" double precision,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."aerial_inspections" enable row level security;


  create table "public"."aerial_sites" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "aerial_site_name" text not null,
    "aerial_site_code" text,
    "is_active" boolean not null default true,
    "geojson" jsonb not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid,
    "geom" extensions.geometry(MultiPolygon,4326) generated always as (extensions.st_collectionextract(extensions.st_makevalid(extensions.st_geomfromgeojson((geojson)::text)), 3)) stored
      );


alter table "public"."aerial_sites" enable row level security;


  create table "public"."catch_basin_missions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "basin_count" integer not null,
    "geojson" jsonb,
    "notes" text,
    "sample_dry" integer,
    "sample_wet" integer,
    "geom" extensions.geometry(MultiPolygon,4326) generated always as (extensions.st_collectionextract(extensions.st_makevalid(extensions.st_geomfromgeojson((geojson)::text)), 3)) stored,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."catch_basin_missions" enable row level security;


  create table "public"."collection_results" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "collection_id" uuid not null,
    "landing_rate_id" uuid,
    "species_id" uuid not null,
    "mosquito_count" integer not null,
    "identified_by" uuid,
    "sex" public.species_sex default 'female'::public.species_sex,
    "status" public.species_status,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."collection_results" enable row level security;


  create table "public"."densities" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "density_name" text not null,
    "range_max" integer,
    "range_min" integer,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."densities" enable row level security;


  create table "public"."flight_aerial_sites" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "flight_id" uuid not null,
    "aerial_site_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."flight_aerial_sites" enable row level security;


  create table "public"."flight_batches" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "flight_id" uuid not null,
    "batch_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."flight_batches" enable row level security;


  create table "public"."flights" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "aircraft_id" uuid not null,
    "flight_by" uuid not null,
    "flight_date" date not null,
    "metadata" jsonb,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."flights" enable row level security;


  create table "public"."hand_ulvs" (
    "id" uuid not null default gen_random_uuid(),
    "address_id" uuid,
    "group_id" uuid not null,
    "lat" double precision,
    "lng" double precision,
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


alter table "public"."hand_ulvs" enable row level security;


  create table "public"."insecticide_batches" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "insecticide_id" uuid not null,
    "batch_name" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."insecticide_batches" enable row level security;


  create table "public"."landing_rates" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "landing_rate_by" uuid,
    "landing_rate_date" date not null,
    "address_id" uuid,
    "lat" double precision not null,
    "lng" double precision not null,
    "geom" extensions.geometry(Point,4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)) stored,
    "started_at" timestamp with time zone,
    "stopped_at" timestamp with time zone,
    "duration_amount" integer,
    "duration_unit_id" uuid,
    "temperature" integer,
    "temperature_unit_id" uuid,
    "wind_speed" double precision,
    "wind_speed_unit_id" uuid,
    "observed_count" integer not null,
    "sample_id" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."landing_rates" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "address_id" uuid not null,
    "contact_id" uuid not null,
    "has_bees" boolean not null default false,
    "is_active" boolean not null default true,
    "is_no_spray" boolean not null default false,
    "radius" integer,
    "radius_unit_id" uuid,
    "region_id" uuid,
    "wants_email" boolean not null default false,
    "wants_fax" boolean not null default false,
    "wants_phone" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."notifications" enable row level security;


  create table "public"."region_folders" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "region_folder_name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."region_folders" enable row level security;


  create table "public"."route_items" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "route_id" uuid not null,
    "habitat_id" uuid,
    "rank_string" text not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."route_items" enable row level security;


  create table "public"."routes" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "route_name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."routes" enable row level security;


  create table "public"."sample_results" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "sample_id" uuid not null,
    "species_id" uuid not null,
    "identified_by" uuid not null,
    "identified_at" date not null,
    "larvae_count" integer not null,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."sample_results" enable row level security;


  create table "public"."samples" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "inspection_id" uuid,
    "display_id" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."samples" enable row level security;


  create table "public"."truck_ulvs" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "area_description" text,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "start_odometer" double precision,
    "end_odometer" double precision,
    "start_temperature" double precision,
    "end_temperature" double precision,
    "temperature_unit_id" uuid,
    "start_wind_speed" double precision,
    "end_wind_speed" double precision,
    "wind_speed_unit_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid,
    "vehicle_id" uuid,
    "geojson" jsonb,
    "geom" extensions.geometry(MultiPolygon,4326) generated always as (extensions.st_collectionextract(extensions.st_makevalid(extensions.st_geomfromgeojson((geojson)::text)), 3)) stored
      );


alter table "public"."truck_ulvs" enable row level security;


  create table "public"."ulv_missions" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "mission_date" date not null,
    "rain_date" date,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_cancelled" boolean not null default false,
    "area_description" text,
    "completion_date" date,
    "geojson" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid,
    "geom" extensions.geometry(MultiPolygon,4326) generated always as (extensions.st_collectionextract(extensions.st_makevalid(extensions.st_geomfromgeojson((geojson)::text)), 3)) stored
      );


alter table "public"."ulv_missions" enable row level security;


  create table "public"."vehicles" (
    "id" uuid not null default gen_random_uuid(),
    "group_id" uuid not null,
    "vehicle_name" text not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."vehicles" enable row level security;

alter table "public"."additional_personnel" drop column "mission_applications_id";

alter table "public"."additional_personnel" drop column "profile_id";

alter table "public"."additional_personnel" add column "aerial_inspection_id" uuid;

alter table "public"."additional_personnel" add column "application_id" uuid;

alter table "public"."additional_personnel" add column "flight_id" uuid;

alter table "public"."additional_personnel" add column "parent_table_name" text generated always as (
CASE
    WHEN (inspection_id IS NOT NULL) THEN 'inspections'::text
    WHEN (aerial_inspection_id IS NOT NULL) THEN 'aerial_inspections'::text
    WHEN (flight_id IS NOT NULL) THEN 'flights'::text
    WHEN (application_id IS NOT NULL) THEN 'applications'::text
    ELSE NULL::text
END) stored;

alter table "public"."additional_personnel" add column "personnel_id" uuid not null;

alter table "public"."applications" drop column "mission_applications_id";

alter table "public"."applications" add column "applicator_id" uuid;

alter table "public"."applications" add column "batch_id" uuid;

alter table "public"."applications" add column "catch_basin_mission_id" uuid;

alter table "public"."applications" add column "flight_aerial_site_id" uuid;

alter table "public"."applications" add column "hand_ulv_id" uuid;

alter table "public"."applications" add column "truck_ulv_id" uuid;

alter table "public"."collections" drop column "has_problem";

alter table "public"."collections" add column "has_error" boolean default false;

alter table "public"."comments" drop column "adulticide_mission_id";

alter table "public"."comments" drop column "habitat_id";

alter table "public"."comments" drop column "mission_applications_id";

alter table "public"."comments" drop column "object_id";

alter table "public"."comments" drop column "object_type";

alter table "public"."comments" add column "aerial_site_id" uuid;

alter table "public"."comments" add column "contact_id" uuid;

alter table "public"."comments" add column "landing_rate_id" uuid;

alter table "public"."comments" add column "notification_id" uuid;

alter table "public"."comments" add column "sample_id" uuid;

alter table "public"."comments" add column "trap_id" uuid;

alter table "public"."comments" add column "parent_type" text generated always as (
CASE
    WHEN (parent_id IS NOT NULL) THEN 'comment'::text
    WHEN (trap_id IS NOT NULL) THEN 'trap'::text
    WHEN (collection_id IS NOT NULL) THEN 'collection'::text
    WHEN (landing_rate_id IS NOT NULL) THEN 'landing_rate'::text
    WHEN (service_request_id IS NOT NULL) THEN 'service_request'::text
    WHEN (contact_id IS NOT NULL) THEN 'contact'::text
    WHEN (aerial_site_id IS NOT NULL) THEN 'aerial_site'::text
    WHEN (sample_id IS NOT NULL) THEN 'sample'::text
    WHEN (notification_id IS NOT NULL) THEN 'notification'::text
    ELSE 'unknown'::text
END) stored;

alter table "public"."contacts" drop column "fax_number";

alter table "public"."contacts" drop column "first_name";

alter table "public"."contacts" drop column "last_name";

alter table "public"."contacts" drop column "primary_phone";

alter table "public"."contacts" drop column "secondary_phone";

alter table "public"."contacts" add column "alternate_phone" text;

alter table "public"."contacts" add column "contact_name" text;

alter table "public"."contacts" add column "department" text;

alter table "public"."contacts" add column "fax" text;

alter table "public"."contacts" add column "metadata" jsonb;

alter table "public"."contacts" add column "preferred_phone" text;

alter table "public"."genera" drop column "created_at";

alter table "public"."groups" drop column "logo_url";

alter table "public"."groups" alter column "updated_at" set default now();

alter table "public"."groups" alter column "updated_at" set not null;

alter table "public"."habitats" drop column "location_id";

alter table "public"."habitats" drop column "name";

alter table "public"."habitats" add column "address_id" uuid;

alter table "public"."habitats" add column "habitat_name" text;

alter table "public"."insecticides" drop column "default_usage_unit_id";

alter table "public"."insecticides" drop column "epa_registration_number";

alter table "public"."insecticides" drop column "name";

alter table "public"."insecticides" add column "conversion_factor" double precision;

alter table "public"."insecticides" add column "default_unit_id" uuid not null;

alter table "public"."insecticides" add column "metadata" jsonb;

alter table "public"."insecticides" add column "registration_number" text not null;

alter table "public"."insecticides" add column "shorthand" text;

alter table "public"."insecticides" add column "trade_name" text not null;

alter table "public"."inspections" drop column "dips";

alter table "public"."inspections" drop column "has_1st_instar";

alter table "public"."inspections" drop column "has_2nd_instar";

alter table "public"."inspections" drop column "has_3rd_instar";

alter table "public"."inspections" drop column "has_4th_instar";

alter table "public"."inspections" drop column "inspector_id";

alter table "public"."inspections" drop column "total_larvae";

alter table "public"."inspections" add column "dip_count" integer;

alter table "public"."inspections" add column "has_first_instar" boolean not null default false;

alter table "public"."inspections" add column "has_fourth_instar" boolean not null default false;

alter table "public"."inspections" add column "has_second_instar" boolean not null default false;

alter table "public"."inspections" add column "has_third_instar" boolean not null default false;

alter table "public"."inspections" add column "inspected_by" uuid;

alter table "public"."inspections" add column "is_source_reduction" boolean not null default false;

alter table "public"."inspections" add column "larvae_count" integer;

alter table "public"."inspections" add column "source_reduction_notes" text;

alter table "public"."profiles" drop column "avatar_url";

alter table "public"."profiles" drop column "first_name";

alter table "public"."profiles" drop column "last_name";

alter table "public"."profiles" add column "full_name" text not null;

alter table "public"."profiles" add column "metadata" jsonb;

alter table "public"."profiles" alter column "updated_at" set default now();

alter table "public"."profiles" alter column "updated_at" set not null;

alter table "public"."profiles" alter column "user_id" set not null;

alter table "public"."regions" add column "region_folder_id" uuid;

alter table "public"."service_requests" drop column "closing_date";

alter table "public"."service_requests" drop column "complainant_id";

alter table "public"."service_requests" drop column "complainant_location_id";

alter table "public"."service_requests" drop column "complaint_details";

alter table "public"."service_requests" drop column "complaint_location_id";

alter table "public"."service_requests" add column "address_id" uuid not null;

alter table "public"."service_requests" add column "contact_id" uuid not null;

alter table "public"."service_requests" add column "details" text not null;

alter table "public"."service_requests" add column "display_id" integer not null;

alter table "public"."service_requests" add column "source" public.service_request_source default 'online'::public.service_request_source;

alter table "public"."species" drop column "created_at";

alter table "public"."species" drop column "sample_photo_url";

alter table "public"."tag_groups" drop column "created_at";

alter table "public"."tag_groups" drop column "created_by";

alter table "public"."tag_groups" drop column "description";

alter table "public"."tag_groups" drop column "group_id";

alter table "public"."tag_groups" drop column "name";

alter table "public"."tag_groups" drop column "updated_at";

alter table "public"."tag_groups" drop column "updated_by";

alter table "public"."tag_groups" add column "tag_group_name" text not null;

alter table "public"."tags" drop column "description";

alter table "public"."tags" drop column "name";

alter table "public"."tags" add column "tag_name" text not null;

alter table "public"."tags" alter column "color" set data type text using "color"::text;

alter table "public"."tags" alter column "tag_group_id" set not null;

alter table "public"."trap_types" add column "shorthand" text;

alter table "public"."traps" drop column "location_id";

alter table "public"."traps" add column "address_id" uuid;

alter table "public"."units" drop column "created_at";

alter table "simmer"."deleted_data" add column "deleted_by" uuid;

drop type "public"."adulticide_mission_method_enum";

drop type "public"."adulticide_mission_status_enum";

drop type "public"."species_sex_enum";

drop type "public"."species_status_enum";

CREATE UNIQUE INDEX address_tags_pkey ON public.address_tags USING btree (id);

CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id);

CREATE UNIQUE INDEX aerial_inspections_pkey ON public.aerial_inspections USING btree (id);

CREATE UNIQUE INDEX aerial_sites_pkey ON public.aerial_sites USING btree (id);

CREATE UNIQUE INDEX catch_basin_missions_pkey ON public.catch_basin_missions USING btree (id);

CREATE UNIQUE INDEX collection_results_pkey ON public.collection_results USING btree (id);

CREATE UNIQUE INDEX densities_pkey ON public.densities USING btree (id);

CREATE UNIQUE INDEX flight_aerial_sites_pkey ON public.flight_aerial_sites USING btree (id);

CREATE UNIQUE INDEX flight_batches_pkey ON public.flight_batches USING btree (id);

CREATE UNIQUE INDEX flights_pkey ON public.flights USING btree (id);

CREATE UNIQUE INDEX hand_ulvs_pkey ON public.hand_ulvs USING btree (id);

CREATE INDEX idx_addresses_geom ON public.addresses USING gist (geom);

CREATE INDEX idx_aerial_sites_geom ON public.aerial_sites USING gist (geom);

CREATE INDEX idx_catch_basin_missions_geom ON public.catch_basin_missions USING gist (geom);

CREATE INDEX idx_ulv_missions_geom ON public.ulv_missions USING gist (geom);

CREATE UNIQUE INDEX insecticide_batches_pkey ON public.insecticide_batches USING btree (id);

CREATE UNIQUE INDEX insecticide_trade_name_unique ON public.insecticides USING btree (group_id, trade_name);

CREATE UNIQUE INDEX landing_rates_pkey ON public.landing_rates USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX region_folders_pkey ON public.region_folders USING btree (id);

CREATE UNIQUE INDEX route_habitat_unique ON public.route_items USING btree (route_id, habitat_id);

CREATE UNIQUE INDEX route_item_rank_unique ON public.route_items USING btree (route_id, rank_string);

CREATE UNIQUE INDEX route_items_pkey ON public.route_items USING btree (id);

CREATE UNIQUE INDEX route_name_unique ON public.routes USING btree (group_id, route_name);

CREATE UNIQUE INDEX routes_pkey ON public.routes USING btree (id);

CREATE UNIQUE INDEX sample_results_pkey ON public.sample_results USING btree (id);

CREATE UNIQUE INDEX samples_pkey ON public.samples USING btree (id);

CREATE UNIQUE INDEX truck_ulvs_pkey ON public.truck_ulvs USING btree (id);

CREATE UNIQUE INDEX ulv_missions_pkey ON public.ulv_missions USING btree (id);

CREATE UNIQUE INDEX unique_address_tag ON public.address_tags USING btree (address_id, tag_id);

CREATE UNIQUE INDEX unique_aerial_site_name_per_group ON public.aerial_sites USING btree (group_id, aerial_site_name);

CREATE UNIQUE INDEX unique_batch_name ON public.insecticide_batches USING btree (group_id, insecticide_id, batch_name);

CREATE UNIQUE INDEX unique_flight_batch ON public.flight_batches USING btree (flight_id, batch_id);

CREATE UNIQUE INDEX unique_region_folder_name ON public.region_folders USING btree (group_id, region_folder_name);

CREATE UNIQUE INDEX unique_sample_species ON public.sample_results USING btree (sample_id, species_id);

CREATE UNIQUE INDEX unique_trap_name_per_group ON public.traps USING btree (group_id, trap_name);

CREATE UNIQUE INDEX unique_vehicle_name ON public.vehicles USING btree (group_id, vehicle_name);

CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id);

CREATE UNIQUE INDEX name_unique ON public.tags USING btree (group_id, tag_group_id, tag_name);

alter table "public"."address_tags" add constraint "address_tags_pkey" PRIMARY KEY using index "address_tags_pkey";

alter table "public"."addresses" add constraint "addresses_pkey" PRIMARY KEY using index "addresses_pkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_pkey" PRIMARY KEY using index "aerial_inspections_pkey";

alter table "public"."aerial_sites" add constraint "aerial_sites_pkey" PRIMARY KEY using index "aerial_sites_pkey";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_pkey" PRIMARY KEY using index "catch_basin_missions_pkey";

alter table "public"."collection_results" add constraint "collection_results_pkey" PRIMARY KEY using index "collection_results_pkey";

alter table "public"."densities" add constraint "densities_pkey" PRIMARY KEY using index "densities_pkey";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_pkey" PRIMARY KEY using index "flight_aerial_sites_pkey";

alter table "public"."flight_batches" add constraint "flight_batches_pkey" PRIMARY KEY using index "flight_batches_pkey";

alter table "public"."flights" add constraint "flights_pkey" PRIMARY KEY using index "flights_pkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_pkey" PRIMARY KEY using index "hand_ulvs_pkey";

alter table "public"."insecticide_batches" add constraint "insecticide_batches_pkey" PRIMARY KEY using index "insecticide_batches_pkey";

alter table "public"."landing_rates" add constraint "landing_rates_pkey" PRIMARY KEY using index "landing_rates_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."region_folders" add constraint "region_folders_pkey" PRIMARY KEY using index "region_folders_pkey";

alter table "public"."route_items" add constraint "route_items_pkey" PRIMARY KEY using index "route_items_pkey";

alter table "public"."routes" add constraint "routes_pkey" PRIMARY KEY using index "routes_pkey";

alter table "public"."sample_results" add constraint "sample_results_pkey" PRIMARY KEY using index "sample_results_pkey";

alter table "public"."samples" add constraint "samples_pkey" PRIMARY KEY using index "samples_pkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_pkey" PRIMARY KEY using index "truck_ulvs_pkey";

alter table "public"."ulv_missions" add constraint "ulv_missions_pkey" PRIMARY KEY using index "ulv_missions_pkey";

alter table "public"."vehicles" add constraint "vehicles_pkey" PRIMARY KEY using index "vehicles_pkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_aerial_inspection_id_fkey" FOREIGN KEY (aerial_inspection_id) REFERENCES public.aerial_inspections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_aerial_inspection_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_application_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_flight_id_fkey" FOREIGN KEY (flight_id) REFERENCES public.flights(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_flight_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_personnel_id_fkey" FOREIGN KEY (personnel_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_personnel_id_fkey";

alter table "public"."additional_personnel" add constraint "one_parent_table_reference" CHECK (((((((inspection_id IS NOT NULL))::integer + ((aerial_inspection_id IS NOT NULL))::integer) + ((flight_id IS NOT NULL))::integer) + ((application_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."additional_personnel" validate constraint "one_parent_table_reference";

alter table "public"."address_tags" add constraint "address_tags_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE CASCADE not valid;

alter table "public"."address_tags" validate constraint "address_tags_address_id_fkey";

alter table "public"."address_tags" add constraint "address_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."address_tags" validate constraint "address_tags_created_by_fkey";

alter table "public"."address_tags" add constraint "address_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."address_tags" validate constraint "address_tags_group_id_fkey";

alter table "public"."address_tags" add constraint "address_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."address_tags" validate constraint "address_tags_tag_id_fkey";

alter table "public"."address_tags" add constraint "address_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."address_tags" validate constraint "address_tags_updated_by_fkey";

alter table "public"."address_tags" add constraint "unique_address_tag" UNIQUE using index "unique_address_tag";

alter table "public"."addresses" add constraint "addresses_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."addresses" validate constraint "addresses_created_by_fkey";

alter table "public"."addresses" add constraint "addresses_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."addresses" validate constraint "addresses_group_id_fkey";

alter table "public"."addresses" add constraint "addresses_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."addresses" validate constraint "addresses_updated_by_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_aerial_site_id_fkey" FOREIGN KEY (aerial_site_id) REFERENCES public.aerial_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_aerial_site_id_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_created_by_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_density_id_fkey" FOREIGN KEY (density_id) REFERENCES public.densities(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_density_id_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_group_id_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_inspected_by_fkey";

alter table "public"."aerial_inspections" add constraint "aerial_inspections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."aerial_inspections" validate constraint "aerial_inspections_updated_by_fkey";

alter table "public"."aerial_inspections" add constraint "larval_data_present" CHECK (((is_wet = true) AND (((larvae_count IS NOT NULL) AND (dips_count IS NOT NULL)) OR (larvae_per_dip IS NOT NULL) OR (density_id IS NOT NULL)))) not valid;

alter table "public"."aerial_inspections" validate constraint "larval_data_present";

alter table "public"."aerial_sites" add constraint "aerial_sites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."aerial_sites" validate constraint "aerial_sites_created_by_fkey";

alter table "public"."aerial_sites" add constraint "aerial_sites_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."aerial_sites" validate constraint "aerial_sites_group_id_fkey";

alter table "public"."aerial_sites" add constraint "aerial_sites_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."aerial_sites" validate constraint "aerial_sites_updated_by_fkey";

alter table "public"."aerial_sites" add constraint "unique_aerial_site_name_per_group" UNIQUE using index "unique_aerial_site_name_per_group";

alter table "public"."applications" add constraint "amount_applied_positive" CHECK ((amount_applied > (0)::numeric)) not valid;

alter table "public"."applications" validate constraint "amount_applied_positive";

alter table "public"."applications" add constraint "applications_applicator_id_fkey" FOREIGN KEY (applicator_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_applicator_id_fkey";

alter table "public"."applications" add constraint "applications_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.insecticide_batches(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_batch_id_fkey";

alter table "public"."applications" add constraint "applications_catch_basin_mission_id_fkey" FOREIGN KEY (catch_basin_mission_id) REFERENCES public.catch_basin_missions(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_catch_basin_mission_id_fkey";

alter table "public"."applications" add constraint "applications_flight_aerial_site_id_fkey" FOREIGN KEY (flight_aerial_site_id) REFERENCES public.flight_aerial_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_flight_aerial_site_id_fkey";

alter table "public"."applications" add constraint "applications_hand_ulv_id_fkey" FOREIGN KEY (hand_ulv_id) REFERENCES public.hand_ulvs(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_hand_ulv_id_fkey";

alter table "public"."applications" add constraint "applications_truck_ulv_id_fkey" FOREIGN KEY (truck_ulv_id) REFERENCES public.truck_ulvs(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_truck_ulv_id_fkey";

alter table "public"."applications" add constraint "one_originating_table" CHECK ((((((((inspection_id IS NOT NULL))::integer + ((flight_aerial_site_id IS NOT NULL))::integer) + ((catch_basin_mission_id IS NOT NULL))::integer) + ((truck_ulv_id IS NOT NULL))::integer) + ((hand_ulv_id IS NOT NULL))::integer) = 1)) not valid;

alter table "public"."applications" validate constraint "one_originating_table";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."catch_basin_missions" validate constraint "catch_basin_missions_created_by_fkey";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."catch_basin_missions" validate constraint "catch_basin_missions_group_id_fkey";

alter table "public"."catch_basin_missions" add constraint "catch_basin_missions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."catch_basin_missions" validate constraint "catch_basin_missions_updated_by_fkey";

alter table "public"."catch_basin_missions" add constraint "positive_basin_count" CHECK ((basin_count > 0)) not valid;

alter table "public"."catch_basin_missions" validate constraint "positive_basin_count";

alter table "public"."collection_results" add constraint "collection_results_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."collection_results" validate constraint "collection_results_collection_id_fkey";

alter table "public"."collection_results" add constraint "collection_results_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collection_results" validate constraint "collection_results_created_by_fkey";

alter table "public"."collection_results" add constraint "collection_results_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."collection_results" validate constraint "collection_results_group_id_fkey";

alter table "public"."collection_results" add constraint "collection_results_identified_by_fkey" FOREIGN KEY (identified_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collection_results" validate constraint "collection_results_identified_by_fkey";

alter table "public"."collection_results" add constraint "collection_results_landing_rate_id_fkey" FOREIGN KEY (landing_rate_id) REFERENCES public.landing_rates(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."collection_results" validate constraint "collection_results_landing_rate_id_fkey";

alter table "public"."collection_results" add constraint "collection_results_species_id_fkey" FOREIGN KEY (species_id) REFERENCES public.species(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."collection_results" validate constraint "collection_results_species_id_fkey";

alter table "public"."collection_results" add constraint "collection_results_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collection_results" validate constraint "collection_results_updated_by_fkey";

alter table "public"."collection_results" add constraint "count_non_negative" CHECK ((mosquito_count >= 0)) not valid;

alter table "public"."collection_results" validate constraint "count_non_negative";

alter table "public"."collection_results" add constraint "one_source" CHECK (((collection_id IS NOT NULL) OR (landing_rate_id IS NOT NULL))) not valid;

alter table "public"."collection_results" validate constraint "one_source";

alter table "public"."comments" add constraint "comments_aerial_site_id_fkey" FOREIGN KEY (aerial_site_id) REFERENCES public.aerial_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_aerial_site_id_fkey";

alter table "public"."comments" add constraint "comments_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_contact_id_fkey";

alter table "public"."comments" add constraint "comments_landing_rate_id_fkey" FOREIGN KEY (landing_rate_id) REFERENCES public.landing_rates(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_landing_rate_id_fkey";

alter table "public"."comments" add constraint "comments_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_notification_id_fkey";

alter table "public"."comments" add constraint "comments_sample_id_fkey" FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_sample_id_fkey";

alter table "public"."comments" add constraint "comments_trap_id_fkey" FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_trap_id_fkey";

alter table "public"."contacts" add constraint "at_least_one_contact" CHECK ((num_nonnulls(NULLIF(preferred_phone, ''::text), NULLIF(email, ''::text), NULLIF(fax, ''::text)) > 0)) not valid;

alter table "public"."contacts" validate constraint "at_least_one_contact";

alter table "public"."densities" add constraint "densities_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."densities" validate constraint "densities_created_by_fkey";

alter table "public"."densities" add constraint "densities_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."densities" validate constraint "densities_group_id_fkey";

alter table "public"."densities" add constraint "densities_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."densities" validate constraint "densities_updated_by_fkey";

alter table "public"."densities" add constraint "range_valid" CHECK ((range_min < range_max)) not valid;

alter table "public"."densities" validate constraint "range_valid";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_aerial_site_id_fkey" FOREIGN KEY (aerial_site_id) REFERENCES public.aerial_sites(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flight_aerial_sites" validate constraint "flight_aerial_sites_aerial_site_id_fkey";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flight_aerial_sites" validate constraint "flight_aerial_sites_created_by_fkey";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_flight_id_fkey" FOREIGN KEY (flight_id) REFERENCES public.flights(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flight_aerial_sites" validate constraint "flight_aerial_sites_flight_id_fkey";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flight_aerial_sites" validate constraint "flight_aerial_sites_group_id_fkey";

alter table "public"."flight_aerial_sites" add constraint "flight_aerial_sites_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flight_aerial_sites" validate constraint "flight_aerial_sites_updated_by_fkey";

alter table "public"."flight_batches" add constraint "flight_batches_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.insecticide_batches(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."flight_batches" validate constraint "flight_batches_batch_id_fkey";

alter table "public"."flight_batches" add constraint "flight_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flight_batches" validate constraint "flight_batches_created_by_fkey";

alter table "public"."flight_batches" add constraint "flight_batches_flight_id_fkey" FOREIGN KEY (flight_id) REFERENCES public.flights(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."flight_batches" validate constraint "flight_batches_flight_id_fkey";

alter table "public"."flight_batches" add constraint "flight_batches_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flight_batches" validate constraint "flight_batches_group_id_fkey";

alter table "public"."flight_batches" add constraint "flight_batches_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flight_batches" validate constraint "flight_batches_updated_by_fkey";

alter table "public"."flight_batches" add constraint "unique_flight_batch" UNIQUE using index "unique_flight_batch";

alter table "public"."flights" add constraint "flights_aircraft_id_fkey" FOREIGN KEY (aircraft_id) REFERENCES public.vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flights" validate constraint "flights_aircraft_id_fkey";

alter table "public"."flights" add constraint "flights_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flights" validate constraint "flights_created_by_fkey";

alter table "public"."flights" add constraint "flights_flight_by_fkey" FOREIGN KEY (flight_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flights" validate constraint "flights_flight_by_fkey";

alter table "public"."flights" add constraint "flights_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."flights" validate constraint "flights_group_id_fkey";

alter table "public"."flights" add constraint "flights_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."flights" validate constraint "flights_updated_by_fkey";

alter table "public"."habitats" add constraint "habitats_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_address_id_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_address_id_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_created_by_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_group_id_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_temperature_unit_id_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_updated_by_fkey";

alter table "public"."hand_ulvs" add constraint "hand_ulvs_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."hand_ulvs" validate constraint "hand_ulvs_wind_speed_unit_id_fkey";

alter table "public"."hand_ulvs" add constraint "unit_for_temperature" CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))) not valid;

alter table "public"."hand_ulvs" validate constraint "unit_for_temperature";

alter table "public"."hand_ulvs" add constraint "unit_for_wind_speed" CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))) not valid;

alter table "public"."hand_ulvs" validate constraint "unit_for_wind_speed";

alter table "public"."insecticide_batches" add constraint "insecticide_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."insecticide_batches" validate constraint "insecticide_batches_created_by_fkey";

alter table "public"."insecticide_batches" add constraint "insecticide_batches_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."insecticide_batches" validate constraint "insecticide_batches_group_id_fkey";

alter table "public"."insecticide_batches" add constraint "insecticide_batches_insecticide_id_fkey" FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."insecticide_batches" validate constraint "insecticide_batches_insecticide_id_fkey";

alter table "public"."insecticide_batches" add constraint "insecticide_batches_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."insecticide_batches" validate constraint "insecticide_batches_updated_by_fkey";

alter table "public"."insecticide_batches" add constraint "unique_batch_name" UNIQUE using index "unique_batch_name";

alter table "public"."insecticides" add constraint "insecticide_trade_name_unique" UNIQUE using index "insecticide_trade_name_unique";

alter table "public"."insecticides" add constraint "insecticides_default_unit_id_fkey" FOREIGN KEY (default_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT not valid;

alter table "public"."insecticides" validate constraint "insecticides_default_unit_id_fkey";

alter table "public"."inspections" add constraint "inspections_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_inspected_by_fkey";

alter table "public"."inspections" add constraint "source_reduction_notes_check" CHECK (((is_source_reduction = false) OR ((source_reduction_notes IS NOT NULL) AND (source_reduction_notes <> ''::text)))) not valid;

alter table "public"."inspections" validate constraint "source_reduction_notes_check";

alter table "public"."landing_rates" add constraint "landing_rates_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_address_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_created_by_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_duration_unit_id_fkey" FOREIGN KEY (duration_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_duration_unit_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_group_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_landing_rate_by_fkey" FOREIGN KEY (landing_rate_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_landing_rate_by_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_temperature_unit_id_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_updated_by_fkey";

alter table "public"."landing_rates" add constraint "landing_rates_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."landing_rates" validate constraint "landing_rates_wind_speed_unit_id_fkey";

alter table "public"."landing_rates" add constraint "stopped_after_started" CHECK (((started_at IS NULL) OR (stopped_at IS NULL) OR (stopped_at > started_at))) not valid;

alter table "public"."landing_rates" validate constraint "stopped_after_started";

alter table "public"."landing_rates" add constraint "unit_for_duration" CHECK ((((duration_unit_id IS NULL) AND (duration_amount IS NULL)) OR ((duration_unit_id IS NOT NULL) AND (duration_amount IS NOT NULL)))) not valid;

alter table "public"."landing_rates" validate constraint "unit_for_duration";

alter table "public"."landing_rates" add constraint "unit_for_temperature" CHECK ((((temperature_unit_id IS NULL) AND (temperature IS NULL)) OR ((temperature_unit_id IS NOT NULL) AND (temperature IS NOT NULL)))) not valid;

alter table "public"."landing_rates" validate constraint "unit_for_temperature";

alter table "public"."landing_rates" add constraint "unit_for_wind_speed" CHECK ((((wind_speed_unit_id IS NULL) AND (wind_speed IS NULL)) OR ((wind_speed_unit_id IS NOT NULL) AND (wind_speed IS NOT NULL)))) not valid;

alter table "public"."landing_rates" validate constraint "unit_for_wind_speed";

alter table "public"."notifications" add constraint "minimum_one_contact_method" CHECK (((((wants_email)::integer + (wants_fax)::integer) + (wants_phone)::integer) >= 1)) not valid;

alter table "public"."notifications" validate constraint "minimum_one_contact_method";

alter table "public"."notifications" add constraint "notifications_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."notifications" validate constraint "notifications_address_id_fkey";

alter table "public"."notifications" add constraint "notifications_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."notifications" validate constraint "notifications_contact_id_fkey";

alter table "public"."notifications" add constraint "notifications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."notifications" validate constraint "notifications_created_by_fkey";

alter table "public"."notifications" add constraint "notifications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."notifications" validate constraint "notifications_group_id_fkey";

alter table "public"."notifications" add constraint "notifications_radius_unit_id_fkey" FOREIGN KEY (radius_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."notifications" validate constraint "notifications_radius_unit_id_fkey";

alter table "public"."notifications" add constraint "notifications_region_id_fkey" FOREIGN KEY (region_id) REFERENCES public.regions(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."notifications" validate constraint "notifications_region_id_fkey";

alter table "public"."notifications" add constraint "notifications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."notifications" validate constraint "notifications_updated_by_fkey";

alter table "public"."notifications" add constraint "radius_unit_required_if_radius" CHECK ((((radius IS NULL) AND (radius_unit_id IS NULL)) OR ((radius IS NOT NULL) AND (radius_unit_id IS NOT NULL)))) not valid;

alter table "public"."notifications" validate constraint "radius_unit_required_if_radius";

alter table "public"."region_folders" add constraint "region_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."region_folders" validate constraint "region_folders_created_by_fkey";

alter table "public"."region_folders" add constraint "region_folders_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."region_folders" validate constraint "region_folders_group_id_fkey";

alter table "public"."region_folders" add constraint "region_folders_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."region_folders" validate constraint "region_folders_updated_by_fkey";

alter table "public"."region_folders" add constraint "unique_region_folder_name" UNIQUE using index "unique_region_folder_name";

alter table "public"."regions" add constraint "regions_region_folder_id_fkey" FOREIGN KEY (region_folder_id) REFERENCES public.region_folders(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_region_folder_id_fkey";

alter table "public"."route_items" add constraint "route_habitat_unique" UNIQUE using index "route_habitat_unique";

alter table "public"."route_items" add constraint "route_item_rank_unique" UNIQUE using index "route_item_rank_unique";

alter table "public"."route_items" add constraint "route_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."route_items" validate constraint "route_items_created_by_fkey";

alter table "public"."route_items" add constraint "route_items_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."route_items" validate constraint "route_items_group_id_fkey";

alter table "public"."route_items" add constraint "route_items_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."route_items" validate constraint "route_items_habitat_id_fkey";

alter table "public"."route_items" add constraint "route_items_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE not valid;

alter table "public"."route_items" validate constraint "route_items_route_id_fkey";

alter table "public"."route_items" add constraint "route_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."route_items" validate constraint "route_items_updated_by_fkey";

alter table "public"."routes" add constraint "route_name_unique" UNIQUE using index "route_name_unique";

alter table "public"."routes" add constraint "routes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."routes" validate constraint "routes_created_by_fkey";

alter table "public"."routes" add constraint "routes_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."routes" validate constraint "routes_group_id_fkey";

alter table "public"."routes" add constraint "routes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."routes" validate constraint "routes_updated_by_fkey";

alter table "public"."sample_results" add constraint "larvae_count_positive" CHECK ((larvae_count >= 0)) not valid;

alter table "public"."sample_results" validate constraint "larvae_count_positive";

alter table "public"."sample_results" add constraint "sample_results_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."sample_results" validate constraint "sample_results_created_by_fkey";

alter table "public"."sample_results" add constraint "sample_results_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."sample_results" validate constraint "sample_results_group_id_fkey";

alter table "public"."sample_results" add constraint "sample_results_identified_by_fkey" FOREIGN KEY (identified_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."sample_results" validate constraint "sample_results_identified_by_fkey";

alter table "public"."sample_results" add constraint "sample_results_sample_id_fkey" FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."sample_results" validate constraint "sample_results_sample_id_fkey";

alter table "public"."sample_results" add constraint "sample_results_species_id_fkey" FOREIGN KEY (species_id) REFERENCES public.species(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."sample_results" validate constraint "sample_results_species_id_fkey";

alter table "public"."sample_results" add constraint "sample_results_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."sample_results" validate constraint "sample_results_updated_by_fkey";

alter table "public"."sample_results" add constraint "unique_sample_species" UNIQUE using index "unique_sample_species";

alter table "public"."samples" add constraint "samples_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."samples" validate constraint "samples_created_by_fkey";

alter table "public"."samples" add constraint "samples_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."samples" validate constraint "samples_group_id_fkey";

alter table "public"."samples" add constraint "samples_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."samples" validate constraint "samples_inspection_id_fkey";

alter table "public"."samples" add constraint "samples_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."samples" validate constraint "samples_updated_by_fkey";

alter table "public"."service_requests" add constraint "service_requests_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_address_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_contact_id_fkey";

alter table "public"."traps" add constraint "traps_address_id_fkey" FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_address_id_fkey";

alter table "public"."traps" add constraint "unique_trap_name_per_group" UNIQUE using index "unique_trap_name_per_group";

alter table "public"."truck_ulvs" add constraint "temperature_unit" CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))) not valid;

alter table "public"."truck_ulvs" validate constraint "temperature_unit";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_created_by_fkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_group_id_fkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_temperature_unit_id_fkey" FOREIGN KEY (temperature_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_temperature_unit_id_fkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_updated_by_fkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_vehicle_id_fkey";

alter table "public"."truck_ulvs" add constraint "truck_ulvs_wind_speed_unit_id_fkey" FOREIGN KEY (wind_speed_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."truck_ulvs" validate constraint "truck_ulvs_wind_speed_unit_id_fkey";

alter table "public"."truck_ulvs" add constraint "valid_time_range" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time))) not valid;

alter table "public"."truck_ulvs" validate constraint "valid_time_range";

alter table "public"."truck_ulvs" add constraint "wind_speed_unit" CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))) not valid;

alter table "public"."truck_ulvs" validate constraint "wind_speed_unit";

alter table "public"."ulv_missions" add constraint "completion_date_after_mission_date" CHECK (((completion_date IS NULL) OR (completion_date >= mission_date))) not valid;

alter table "public"."ulv_missions" validate constraint "completion_date_after_mission_date";

alter table "public"."ulv_missions" add constraint "rain_date_after_mission_date" CHECK (((rain_date IS NULL) OR (rain_date > mission_date))) not valid;

alter table "public"."ulv_missions" validate constraint "rain_date_after_mission_date";

alter table "public"."ulv_missions" add constraint "ulv_missions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."ulv_missions" validate constraint "ulv_missions_created_by_fkey";

alter table "public"."ulv_missions" add constraint "ulv_missions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."ulv_missions" validate constraint "ulv_missions_group_id_fkey";

alter table "public"."ulv_missions" add constraint "ulv_missions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."ulv_missions" validate constraint "ulv_missions_updated_by_fkey";

alter table "public"."ulv_missions" add constraint "valid_time_range" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time))) not valid;

alter table "public"."ulv_missions" validate constraint "valid_time_range";

alter table "public"."vehicles" add constraint "unique_vehicle_name" UNIQUE using index "unique_vehicle_name";

alter table "public"."vehicles" add constraint "vehicles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."vehicles" validate constraint "vehicles_created_by_fkey";

alter table "public"."vehicles" add constraint "vehicles_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."vehicles" validate constraint "vehicles_group_id_fkey";

alter table "public"."vehicles" add constraint "vehicles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."vehicles" validate constraint "vehicles_updated_by_fkey";

alter table "simmer"."deleted_data" add constraint "deleted_data_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "simmer"."deleted_data" validate constraint "deleted_data_deleted_by_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_created_by_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_group_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_inspection_id_fkey";

alter table "public"."additional_personnel" add constraint "additional_personnel_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."additional_personnel" validate constraint "additional_personnel_updated_by_fkey";

alter table "public"."applications" add constraint "applications_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_created_by_fkey";

alter table "public"."applications" add constraint "applications_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_group_id_fkey";

alter table "public"."applications" add constraint "applications_insecticide_id_fkey" FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_insecticide_id_fkey";

alter table "public"."applications" add constraint "applications_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."applications" validate constraint "applications_inspection_id_fkey";

alter table "public"."applications" add constraint "applications_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."applications" validate constraint "applications_updated_by_fkey";

alter table "public"."collections" add constraint "collections_collected_by_fkey" FOREIGN KEY (collected_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_collected_by_fkey";

alter table "public"."collections" add constraint "collections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_created_by_fkey";

alter table "public"."collections" add constraint "collections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."collections" validate constraint "collections_group_id_fkey";

alter table "public"."collections" add constraint "collections_trap_id_fkey" FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."collections" validate constraint "collections_trap_id_fkey";

alter table "public"."collections" add constraint "collections_trap_lure_id_fkey" FOREIGN KEY (trap_lure_id) REFERENCES public.trap_lures(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_trap_lure_id_fkey";

alter table "public"."collections" add constraint "collections_trap_set_by_fkey" FOREIGN KEY (trap_set_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_trap_set_by_fkey";

alter table "public"."collections" add constraint "collections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."collections" validate constraint "collections_updated_by_fkey";

alter table "public"."comments" add constraint "comments_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_collection_id_fkey";

alter table "public"."comments" add constraint "comments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_created_by_fkey";

alter table "public"."comments" add constraint "comments_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_group_id_fkey";

alter table "public"."comments" add constraint "comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_parent_id_fkey";

alter table "public"."comments" add constraint "comments_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_service_request_id_fkey";

alter table "public"."comments" add constraint "comments_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."comments" validate constraint "comments_updated_by_fkey";

alter table "public"."contacts" add constraint "contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."contacts" validate constraint "contacts_created_by_fkey";

alter table "public"."contacts" add constraint "contacts_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."contacts" validate constraint "contacts_group_id_fkey";

alter table "public"."contacts" add constraint "contacts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."contacts" validate constraint "contacts_updated_by_fkey";

alter table "public"."groups" add constraint "groups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."groups" validate constraint "groups_created_by_fkey";

alter table "public"."groups" add constraint "groups_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."groups" validate constraint "groups_updated_by_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_created_by_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_group_id_fkey";

alter table "public"."habitat_tags" add constraint "habitat_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."habitat_tags" validate constraint "habitat_tags_updated_by_fkey";

alter table "public"."habitats" add constraint "habitats_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_created_by_fkey";

alter table "public"."habitats" add constraint "habitats_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."habitats" validate constraint "habitats_group_id_fkey";

alter table "public"."habitats" add constraint "habitats_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."habitats" validate constraint "habitats_updated_by_fkey";

alter table "public"."insecticides" add constraint "insecticides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."insecticides" validate constraint "insecticides_created_by_fkey";

alter table "public"."insecticides" add constraint "insecticides_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."insecticides" validate constraint "insecticides_group_id_fkey";

alter table "public"."insecticides" add constraint "insecticides_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."insecticides" validate constraint "insecticides_updated_by_fkey";

alter table "public"."inspections" add constraint "data_integrity" CHECK (((is_wet = false) OR (((larvae_count IS NOT NULL) AND (dip_count IS NOT NULL)) OR (density_id IS NOT NULL) OR ((larvae_count IS NULL) AND (density_id IS NULL))))) not valid;

alter table "public"."inspections" validate constraint "data_integrity";

alter table "public"."inspections" add constraint "inspections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_created_by_fkey";

alter table "public"."inspections" add constraint "inspections_density_id_fkey" FOREIGN KEY (density_id) REFERENCES public.densities(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_density_id_fkey";

alter table "public"."inspections" add constraint "inspections_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_group_id_fkey";

alter table "public"."inspections" add constraint "inspections_habitat_id_fkey" FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."inspections" validate constraint "inspections_habitat_id_fkey";

alter table "public"."inspections" add constraint "inspections_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."inspections" validate constraint "inspections_updated_by_fkey";

alter table "public"."profiles" add constraint "profiles_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_created_by_fkey";

alter table "public"."profiles" add constraint "profiles_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."profiles" validate constraint "profiles_group_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."profiles" validate constraint "profiles_role_id_fkey";

alter table "public"."profiles" add constraint "profiles_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_updated_by_fkey";

alter table "public"."regions" add constraint "regions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_created_by_fkey";

alter table "public"."regions" add constraint "regions_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."regions" validate constraint "regions_group_id_fkey";

alter table "public"."regions" add constraint "regions_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.regions(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_parent_id_fkey";

alter table "public"."regions" add constraint "regions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."regions" validate constraint "regions_updated_by_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_created_by_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_group_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_service_request_id_fkey" FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_service_request_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_tag_id_fkey";

alter table "public"."service_request_tags" add constraint "service_request_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."service_request_tags" validate constraint "service_request_tags_updated_by_fkey";

alter table "public"."service_requests" add constraint "service_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."service_requests" validate constraint "service_requests_created_by_fkey";

alter table "public"."service_requests" add constraint "service_requests_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."service_requests" validate constraint "service_requests_group_id_fkey";

alter table "public"."service_requests" add constraint "service_requests_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."service_requests" validate constraint "service_requests_updated_by_fkey";

alter table "public"."species" add constraint "species_genus_id_fkey" FOREIGN KEY (genus_id) REFERENCES public.genera(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."species" validate constraint "species_genus_id_fkey";

alter table "public"."tags" add constraint "name_unique" UNIQUE using index "name_unique";

alter table "public"."tags" add constraint "tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_created_by_fkey";

alter table "public"."tags" add constraint "tags_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."tags" validate constraint "tags_group_id_fkey";

alter table "public"."tags" add constraint "tags_tag_group_id_fkey" FOREIGN KEY (tag_group_id) REFERENCES public.tag_groups(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_tag_group_id_fkey";

alter table "public"."tags" add constraint "tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."tags" validate constraint "tags_updated_by_fkey";

alter table "public"."trap_lures" add constraint "trap_lures_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_created_by_fkey";

alter table "public"."trap_lures" add constraint "trap_lures_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_group_id_fkey";

alter table "public"."trap_lures" add constraint "trap_lures_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_lures" validate constraint "trap_lures_updated_by_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_created_by_fkey";

alter table "public"."trap_tags" add constraint "trap_tags_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_tags" validate constraint "trap_tags_updated_by_fkey";

alter table "public"."trap_types" add constraint "trap_types_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_types" validate constraint "trap_types_created_by_fkey";

alter table "public"."trap_types" add constraint "trap_types_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."trap_types" validate constraint "trap_types_group_id_fkey";

alter table "public"."trap_types" add constraint "trap_types_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."trap_types" validate constraint "trap_types_updated_by_fkey";

alter table "public"."traps" add constraint "traps_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_created_by_fkey";

alter table "public"."traps" add constraint "traps_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_group_id_fkey";

alter table "public"."traps" add constraint "traps_trap_type_id_fkey" FOREIGN KEY (trap_type_id) REFERENCES public.trap_types(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."traps" validate constraint "traps_trap_type_id_fkey";

alter table "public"."traps" add constraint "traps_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."traps" validate constraint "traps_updated_by_fkey";

alter table "public"."units" add constraint "units_base_unit_id_fkey" FOREIGN KEY (base_unit_id) REFERENCES public.units(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."units" validate constraint "units_base_unit_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
    -- Allow if this is an insert (new user creation)
    if TG_OP = 'INSERT' then
        return NEW;
    end if;

    -- If role_id is being changed
    if OLD.role_id is distinct from NEW.role_id then
        -- Check if the user is trying to change their own role
        if OLD.user_id = auth.uid() then
            raise exception 'Users cannot change their own role';
        end if;
    end if;

    return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    begin
        if TG_OP = 'INSERT' then
            new.created_at = now();
            new.created_by = auth.uid();
            new.updated_at = now();
            new.updated_by = auth.uid();
        end if;

        if TG_OP = 'UPDATE' then
            new.updated_at = now();
            new.updated_by = auth.uid();
        end if;

        return new;
    end;
$function$
;

CREATE OR REPLACE FUNCTION simmer.ids_to_app_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid;
begin
    -- 1. Identify the target user
    if TG_OP = 'DELETE' then
        v_user_id := OLD.user_id;
    elsif TG_OP = 'UPDATE' and (NEW.user_id is null or NEW.role_id is null) and OLD.user_id is not null then
        v_user_id := OLD.user_id;
    else
        v_user_id := NEW.user_id;
    end if;

    if v_user_id is not null then
        -- 2. Atomic Update: Merge or Remove keys in one go
        update auth.users
        set raw_app_meta_data = case 
            -- Cleanup: Strip keys if deleting or nullifying
            when TG_OP = 'DELETE' or (NEW.user_id is null or NEW.role_id is null) then
                coalesce(raw_app_meta_data, '{}'::jsonb) - 'profile_id' - 'group_id' - 'role_id'
            
            -- Sync: Merge new values using the || operator
            else
                coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
                    'profile_id', NEW.id::text,
                    'group_id', NEW.group_id::text,
                    'role_id', NEW.role_id
                )
        end
        where id = v_user_id;
    end if;

    -- 3. Standard trigger return
    return (case when TG_OP = 'DELETE' then OLD else NEW end);
end;
$function$
;

CREATE OR REPLACE FUNCTION simmer.soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  begin
    insert into simmer.deleted_data (original_table, original_id, deleted_by, data)
    values (TG_TABLE_NAME, OLD.id, auth.uid(), row_to_json(OLD)::jsonb);
    return OLD;
  end;
$function$
;

grant delete on table "public"."address_tags" to "anon";

grant insert on table "public"."address_tags" to "anon";

grant references on table "public"."address_tags" to "anon";

grant select on table "public"."address_tags" to "anon";

grant trigger on table "public"."address_tags" to "anon";

grant truncate on table "public"."address_tags" to "anon";

grant update on table "public"."address_tags" to "anon";

grant delete on table "public"."address_tags" to "authenticated";

grant insert on table "public"."address_tags" to "authenticated";

grant references on table "public"."address_tags" to "authenticated";

grant select on table "public"."address_tags" to "authenticated";

grant trigger on table "public"."address_tags" to "authenticated";

grant truncate on table "public"."address_tags" to "authenticated";

grant update on table "public"."address_tags" to "authenticated";

grant delete on table "public"."address_tags" to "service_role";

grant insert on table "public"."address_tags" to "service_role";

grant references on table "public"."address_tags" to "service_role";

grant select on table "public"."address_tags" to "service_role";

grant trigger on table "public"."address_tags" to "service_role";

grant truncate on table "public"."address_tags" to "service_role";

grant update on table "public"."address_tags" to "service_role";

grant delete on table "public"."addresses" to "anon";

grant insert on table "public"."addresses" to "anon";

grant references on table "public"."addresses" to "anon";

grant select on table "public"."addresses" to "anon";

grant trigger on table "public"."addresses" to "anon";

grant truncate on table "public"."addresses" to "anon";

grant update on table "public"."addresses" to "anon";

grant delete on table "public"."addresses" to "authenticated";

grant insert on table "public"."addresses" to "authenticated";

grant references on table "public"."addresses" to "authenticated";

grant select on table "public"."addresses" to "authenticated";

grant trigger on table "public"."addresses" to "authenticated";

grant truncate on table "public"."addresses" to "authenticated";

grant update on table "public"."addresses" to "authenticated";

grant delete on table "public"."addresses" to "service_role";

grant insert on table "public"."addresses" to "service_role";

grant references on table "public"."addresses" to "service_role";

grant select on table "public"."addresses" to "service_role";

grant trigger on table "public"."addresses" to "service_role";

grant truncate on table "public"."addresses" to "service_role";

grant update on table "public"."addresses" to "service_role";

grant delete on table "public"."aerial_inspections" to "anon";

grant insert on table "public"."aerial_inspections" to "anon";

grant references on table "public"."aerial_inspections" to "anon";

grant select on table "public"."aerial_inspections" to "anon";

grant trigger on table "public"."aerial_inspections" to "anon";

grant truncate on table "public"."aerial_inspections" to "anon";

grant update on table "public"."aerial_inspections" to "anon";

grant delete on table "public"."aerial_inspections" to "authenticated";

grant insert on table "public"."aerial_inspections" to "authenticated";

grant references on table "public"."aerial_inspections" to "authenticated";

grant select on table "public"."aerial_inspections" to "authenticated";

grant trigger on table "public"."aerial_inspections" to "authenticated";

grant truncate on table "public"."aerial_inspections" to "authenticated";

grant update on table "public"."aerial_inspections" to "authenticated";

grant delete on table "public"."aerial_inspections" to "service_role";

grant insert on table "public"."aerial_inspections" to "service_role";

grant references on table "public"."aerial_inspections" to "service_role";

grant select on table "public"."aerial_inspections" to "service_role";

grant trigger on table "public"."aerial_inspections" to "service_role";

grant truncate on table "public"."aerial_inspections" to "service_role";

grant update on table "public"."aerial_inspections" to "service_role";

grant delete on table "public"."aerial_sites" to "anon";

grant insert on table "public"."aerial_sites" to "anon";

grant references on table "public"."aerial_sites" to "anon";

grant select on table "public"."aerial_sites" to "anon";

grant trigger on table "public"."aerial_sites" to "anon";

grant truncate on table "public"."aerial_sites" to "anon";

grant update on table "public"."aerial_sites" to "anon";

grant delete on table "public"."aerial_sites" to "authenticated";

grant insert on table "public"."aerial_sites" to "authenticated";

grant references on table "public"."aerial_sites" to "authenticated";

grant select on table "public"."aerial_sites" to "authenticated";

grant trigger on table "public"."aerial_sites" to "authenticated";

grant truncate on table "public"."aerial_sites" to "authenticated";

grant update on table "public"."aerial_sites" to "authenticated";

grant delete on table "public"."aerial_sites" to "service_role";

grant insert on table "public"."aerial_sites" to "service_role";

grant references on table "public"."aerial_sites" to "service_role";

grant select on table "public"."aerial_sites" to "service_role";

grant trigger on table "public"."aerial_sites" to "service_role";

grant truncate on table "public"."aerial_sites" to "service_role";

grant update on table "public"."aerial_sites" to "service_role";

grant delete on table "public"."catch_basin_missions" to "anon";

grant insert on table "public"."catch_basin_missions" to "anon";

grant references on table "public"."catch_basin_missions" to "anon";

grant select on table "public"."catch_basin_missions" to "anon";

grant trigger on table "public"."catch_basin_missions" to "anon";

grant truncate on table "public"."catch_basin_missions" to "anon";

grant update on table "public"."catch_basin_missions" to "anon";

grant delete on table "public"."catch_basin_missions" to "authenticated";

grant insert on table "public"."catch_basin_missions" to "authenticated";

grant references on table "public"."catch_basin_missions" to "authenticated";

grant select on table "public"."catch_basin_missions" to "authenticated";

grant trigger on table "public"."catch_basin_missions" to "authenticated";

grant truncate on table "public"."catch_basin_missions" to "authenticated";

grant update on table "public"."catch_basin_missions" to "authenticated";

grant delete on table "public"."catch_basin_missions" to "service_role";

grant insert on table "public"."catch_basin_missions" to "service_role";

grant references on table "public"."catch_basin_missions" to "service_role";

grant select on table "public"."catch_basin_missions" to "service_role";

grant trigger on table "public"."catch_basin_missions" to "service_role";

grant truncate on table "public"."catch_basin_missions" to "service_role";

grant update on table "public"."catch_basin_missions" to "service_role";

grant delete on table "public"."collection_results" to "anon";

grant insert on table "public"."collection_results" to "anon";

grant references on table "public"."collection_results" to "anon";

grant select on table "public"."collection_results" to "anon";

grant trigger on table "public"."collection_results" to "anon";

grant truncate on table "public"."collection_results" to "anon";

grant update on table "public"."collection_results" to "anon";

grant delete on table "public"."collection_results" to "authenticated";

grant insert on table "public"."collection_results" to "authenticated";

grant references on table "public"."collection_results" to "authenticated";

grant select on table "public"."collection_results" to "authenticated";

grant trigger on table "public"."collection_results" to "authenticated";

grant truncate on table "public"."collection_results" to "authenticated";

grant update on table "public"."collection_results" to "authenticated";

grant delete on table "public"."collection_results" to "service_role";

grant insert on table "public"."collection_results" to "service_role";

grant references on table "public"."collection_results" to "service_role";

grant select on table "public"."collection_results" to "service_role";

grant trigger on table "public"."collection_results" to "service_role";

grant truncate on table "public"."collection_results" to "service_role";

grant update on table "public"."collection_results" to "service_role";

grant delete on table "public"."densities" to "anon";

grant insert on table "public"."densities" to "anon";

grant references on table "public"."densities" to "anon";

grant select on table "public"."densities" to "anon";

grant trigger on table "public"."densities" to "anon";

grant truncate on table "public"."densities" to "anon";

grant update on table "public"."densities" to "anon";

grant delete on table "public"."densities" to "authenticated";

grant insert on table "public"."densities" to "authenticated";

grant references on table "public"."densities" to "authenticated";

grant select on table "public"."densities" to "authenticated";

grant trigger on table "public"."densities" to "authenticated";

grant truncate on table "public"."densities" to "authenticated";

grant update on table "public"."densities" to "authenticated";

grant delete on table "public"."densities" to "service_role";

grant insert on table "public"."densities" to "service_role";

grant references on table "public"."densities" to "service_role";

grant select on table "public"."densities" to "service_role";

grant trigger on table "public"."densities" to "service_role";

grant truncate on table "public"."densities" to "service_role";

grant update on table "public"."densities" to "service_role";

grant delete on table "public"."flight_aerial_sites" to "anon";

grant insert on table "public"."flight_aerial_sites" to "anon";

grant references on table "public"."flight_aerial_sites" to "anon";

grant select on table "public"."flight_aerial_sites" to "anon";

grant trigger on table "public"."flight_aerial_sites" to "anon";

grant truncate on table "public"."flight_aerial_sites" to "anon";

grant update on table "public"."flight_aerial_sites" to "anon";

grant delete on table "public"."flight_aerial_sites" to "authenticated";

grant insert on table "public"."flight_aerial_sites" to "authenticated";

grant references on table "public"."flight_aerial_sites" to "authenticated";

grant select on table "public"."flight_aerial_sites" to "authenticated";

grant trigger on table "public"."flight_aerial_sites" to "authenticated";

grant truncate on table "public"."flight_aerial_sites" to "authenticated";

grant update on table "public"."flight_aerial_sites" to "authenticated";

grant delete on table "public"."flight_aerial_sites" to "service_role";

grant insert on table "public"."flight_aerial_sites" to "service_role";

grant references on table "public"."flight_aerial_sites" to "service_role";

grant select on table "public"."flight_aerial_sites" to "service_role";

grant trigger on table "public"."flight_aerial_sites" to "service_role";

grant truncate on table "public"."flight_aerial_sites" to "service_role";

grant update on table "public"."flight_aerial_sites" to "service_role";

grant delete on table "public"."flight_batches" to "anon";

grant insert on table "public"."flight_batches" to "anon";

grant references on table "public"."flight_batches" to "anon";

grant select on table "public"."flight_batches" to "anon";

grant trigger on table "public"."flight_batches" to "anon";

grant truncate on table "public"."flight_batches" to "anon";

grant update on table "public"."flight_batches" to "anon";

grant delete on table "public"."flight_batches" to "authenticated";

grant insert on table "public"."flight_batches" to "authenticated";

grant references on table "public"."flight_batches" to "authenticated";

grant select on table "public"."flight_batches" to "authenticated";

grant trigger on table "public"."flight_batches" to "authenticated";

grant truncate on table "public"."flight_batches" to "authenticated";

grant update on table "public"."flight_batches" to "authenticated";

grant delete on table "public"."flight_batches" to "service_role";

grant insert on table "public"."flight_batches" to "service_role";

grant references on table "public"."flight_batches" to "service_role";

grant select on table "public"."flight_batches" to "service_role";

grant trigger on table "public"."flight_batches" to "service_role";

grant truncate on table "public"."flight_batches" to "service_role";

grant update on table "public"."flight_batches" to "service_role";

grant delete on table "public"."flights" to "anon";

grant insert on table "public"."flights" to "anon";

grant references on table "public"."flights" to "anon";

grant select on table "public"."flights" to "anon";

grant trigger on table "public"."flights" to "anon";

grant truncate on table "public"."flights" to "anon";

grant update on table "public"."flights" to "anon";

grant delete on table "public"."flights" to "authenticated";

grant insert on table "public"."flights" to "authenticated";

grant references on table "public"."flights" to "authenticated";

grant select on table "public"."flights" to "authenticated";

grant trigger on table "public"."flights" to "authenticated";

grant truncate on table "public"."flights" to "authenticated";

grant update on table "public"."flights" to "authenticated";

grant delete on table "public"."flights" to "service_role";

grant insert on table "public"."flights" to "service_role";

grant references on table "public"."flights" to "service_role";

grant select on table "public"."flights" to "service_role";

grant trigger on table "public"."flights" to "service_role";

grant truncate on table "public"."flights" to "service_role";

grant update on table "public"."flights" to "service_role";

grant delete on table "public"."hand_ulvs" to "anon";

grant insert on table "public"."hand_ulvs" to "anon";

grant references on table "public"."hand_ulvs" to "anon";

grant select on table "public"."hand_ulvs" to "anon";

grant trigger on table "public"."hand_ulvs" to "anon";

grant truncate on table "public"."hand_ulvs" to "anon";

grant update on table "public"."hand_ulvs" to "anon";

grant delete on table "public"."hand_ulvs" to "authenticated";

grant insert on table "public"."hand_ulvs" to "authenticated";

grant references on table "public"."hand_ulvs" to "authenticated";

grant select on table "public"."hand_ulvs" to "authenticated";

grant trigger on table "public"."hand_ulvs" to "authenticated";

grant truncate on table "public"."hand_ulvs" to "authenticated";

grant update on table "public"."hand_ulvs" to "authenticated";

grant delete on table "public"."hand_ulvs" to "service_role";

grant insert on table "public"."hand_ulvs" to "service_role";

grant references on table "public"."hand_ulvs" to "service_role";

grant select on table "public"."hand_ulvs" to "service_role";

grant trigger on table "public"."hand_ulvs" to "service_role";

grant truncate on table "public"."hand_ulvs" to "service_role";

grant update on table "public"."hand_ulvs" to "service_role";

grant delete on table "public"."insecticide_batches" to "anon";

grant insert on table "public"."insecticide_batches" to "anon";

grant references on table "public"."insecticide_batches" to "anon";

grant select on table "public"."insecticide_batches" to "anon";

grant trigger on table "public"."insecticide_batches" to "anon";

grant truncate on table "public"."insecticide_batches" to "anon";

grant update on table "public"."insecticide_batches" to "anon";

grant delete on table "public"."insecticide_batches" to "authenticated";

grant insert on table "public"."insecticide_batches" to "authenticated";

grant references on table "public"."insecticide_batches" to "authenticated";

grant select on table "public"."insecticide_batches" to "authenticated";

grant trigger on table "public"."insecticide_batches" to "authenticated";

grant truncate on table "public"."insecticide_batches" to "authenticated";

grant update on table "public"."insecticide_batches" to "authenticated";

grant delete on table "public"."insecticide_batches" to "service_role";

grant insert on table "public"."insecticide_batches" to "service_role";

grant references on table "public"."insecticide_batches" to "service_role";

grant select on table "public"."insecticide_batches" to "service_role";

grant trigger on table "public"."insecticide_batches" to "service_role";

grant truncate on table "public"."insecticide_batches" to "service_role";

grant update on table "public"."insecticide_batches" to "service_role";

grant delete on table "public"."landing_rates" to "anon";

grant insert on table "public"."landing_rates" to "anon";

grant references on table "public"."landing_rates" to "anon";

grant select on table "public"."landing_rates" to "anon";

grant trigger on table "public"."landing_rates" to "anon";

grant truncate on table "public"."landing_rates" to "anon";

grant update on table "public"."landing_rates" to "anon";

grant delete on table "public"."landing_rates" to "authenticated";

grant insert on table "public"."landing_rates" to "authenticated";

grant references on table "public"."landing_rates" to "authenticated";

grant select on table "public"."landing_rates" to "authenticated";

grant trigger on table "public"."landing_rates" to "authenticated";

grant truncate on table "public"."landing_rates" to "authenticated";

grant update on table "public"."landing_rates" to "authenticated";

grant delete on table "public"."landing_rates" to "service_role";

grant insert on table "public"."landing_rates" to "service_role";

grant references on table "public"."landing_rates" to "service_role";

grant select on table "public"."landing_rates" to "service_role";

grant trigger on table "public"."landing_rates" to "service_role";

grant truncate on table "public"."landing_rates" to "service_role";

grant update on table "public"."landing_rates" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."region_folders" to "anon";

grant insert on table "public"."region_folders" to "anon";

grant references on table "public"."region_folders" to "anon";

grant select on table "public"."region_folders" to "anon";

grant trigger on table "public"."region_folders" to "anon";

grant truncate on table "public"."region_folders" to "anon";

grant update on table "public"."region_folders" to "anon";

grant delete on table "public"."region_folders" to "authenticated";

grant insert on table "public"."region_folders" to "authenticated";

grant references on table "public"."region_folders" to "authenticated";

grant select on table "public"."region_folders" to "authenticated";

grant trigger on table "public"."region_folders" to "authenticated";

grant truncate on table "public"."region_folders" to "authenticated";

grant update on table "public"."region_folders" to "authenticated";

grant delete on table "public"."region_folders" to "service_role";

grant insert on table "public"."region_folders" to "service_role";

grant references on table "public"."region_folders" to "service_role";

grant select on table "public"."region_folders" to "service_role";

grant trigger on table "public"."region_folders" to "service_role";

grant truncate on table "public"."region_folders" to "service_role";

grant update on table "public"."region_folders" to "service_role";

grant delete on table "public"."route_items" to "anon";

grant insert on table "public"."route_items" to "anon";

grant references on table "public"."route_items" to "anon";

grant select on table "public"."route_items" to "anon";

grant trigger on table "public"."route_items" to "anon";

grant truncate on table "public"."route_items" to "anon";

grant update on table "public"."route_items" to "anon";

grant delete on table "public"."route_items" to "authenticated";

grant insert on table "public"."route_items" to "authenticated";

grant references on table "public"."route_items" to "authenticated";

grant select on table "public"."route_items" to "authenticated";

grant trigger on table "public"."route_items" to "authenticated";

grant truncate on table "public"."route_items" to "authenticated";

grant update on table "public"."route_items" to "authenticated";

grant delete on table "public"."route_items" to "service_role";

grant insert on table "public"."route_items" to "service_role";

grant references on table "public"."route_items" to "service_role";

grant select on table "public"."route_items" to "service_role";

grant trigger on table "public"."route_items" to "service_role";

grant truncate on table "public"."route_items" to "service_role";

grant update on table "public"."route_items" to "service_role";

grant delete on table "public"."routes" to "anon";

grant insert on table "public"."routes" to "anon";

grant references on table "public"."routes" to "anon";

grant select on table "public"."routes" to "anon";

grant trigger on table "public"."routes" to "anon";

grant truncate on table "public"."routes" to "anon";

grant update on table "public"."routes" to "anon";

grant delete on table "public"."routes" to "authenticated";

grant insert on table "public"."routes" to "authenticated";

grant references on table "public"."routes" to "authenticated";

grant select on table "public"."routes" to "authenticated";

grant trigger on table "public"."routes" to "authenticated";

grant truncate on table "public"."routes" to "authenticated";

grant update on table "public"."routes" to "authenticated";

grant delete on table "public"."routes" to "service_role";

grant insert on table "public"."routes" to "service_role";

grant references on table "public"."routes" to "service_role";

grant select on table "public"."routes" to "service_role";

grant trigger on table "public"."routes" to "service_role";

grant truncate on table "public"."routes" to "service_role";

grant update on table "public"."routes" to "service_role";

grant delete on table "public"."sample_results" to "anon";

grant insert on table "public"."sample_results" to "anon";

grant references on table "public"."sample_results" to "anon";

grant select on table "public"."sample_results" to "anon";

grant trigger on table "public"."sample_results" to "anon";

grant truncate on table "public"."sample_results" to "anon";

grant update on table "public"."sample_results" to "anon";

grant delete on table "public"."sample_results" to "authenticated";

grant insert on table "public"."sample_results" to "authenticated";

grant references on table "public"."sample_results" to "authenticated";

grant select on table "public"."sample_results" to "authenticated";

grant trigger on table "public"."sample_results" to "authenticated";

grant truncate on table "public"."sample_results" to "authenticated";

grant update on table "public"."sample_results" to "authenticated";

grant delete on table "public"."sample_results" to "service_role";

grant insert on table "public"."sample_results" to "service_role";

grant references on table "public"."sample_results" to "service_role";

grant select on table "public"."sample_results" to "service_role";

grant trigger on table "public"."sample_results" to "service_role";

grant truncate on table "public"."sample_results" to "service_role";

grant update on table "public"."sample_results" to "service_role";

grant delete on table "public"."samples" to "anon";

grant insert on table "public"."samples" to "anon";

grant references on table "public"."samples" to "anon";

grant select on table "public"."samples" to "anon";

grant trigger on table "public"."samples" to "anon";

grant truncate on table "public"."samples" to "anon";

grant update on table "public"."samples" to "anon";

grant delete on table "public"."samples" to "authenticated";

grant insert on table "public"."samples" to "authenticated";

grant references on table "public"."samples" to "authenticated";

grant select on table "public"."samples" to "authenticated";

grant trigger on table "public"."samples" to "authenticated";

grant truncate on table "public"."samples" to "authenticated";

grant update on table "public"."samples" to "authenticated";

grant delete on table "public"."samples" to "service_role";

grant insert on table "public"."samples" to "service_role";

grant references on table "public"."samples" to "service_role";

grant select on table "public"."samples" to "service_role";

grant trigger on table "public"."samples" to "service_role";

grant truncate on table "public"."samples" to "service_role";

grant update on table "public"."samples" to "service_role";

grant delete on table "public"."truck_ulvs" to "anon";

grant insert on table "public"."truck_ulvs" to "anon";

grant references on table "public"."truck_ulvs" to "anon";

grant select on table "public"."truck_ulvs" to "anon";

grant trigger on table "public"."truck_ulvs" to "anon";

grant truncate on table "public"."truck_ulvs" to "anon";

grant update on table "public"."truck_ulvs" to "anon";

grant delete on table "public"."truck_ulvs" to "authenticated";

grant insert on table "public"."truck_ulvs" to "authenticated";

grant references on table "public"."truck_ulvs" to "authenticated";

grant select on table "public"."truck_ulvs" to "authenticated";

grant trigger on table "public"."truck_ulvs" to "authenticated";

grant truncate on table "public"."truck_ulvs" to "authenticated";

grant update on table "public"."truck_ulvs" to "authenticated";

grant delete on table "public"."truck_ulvs" to "service_role";

grant insert on table "public"."truck_ulvs" to "service_role";

grant references on table "public"."truck_ulvs" to "service_role";

grant select on table "public"."truck_ulvs" to "service_role";

grant trigger on table "public"."truck_ulvs" to "service_role";

grant truncate on table "public"."truck_ulvs" to "service_role";

grant update on table "public"."truck_ulvs" to "service_role";

grant delete on table "public"."ulv_missions" to "anon";

grant insert on table "public"."ulv_missions" to "anon";

grant references on table "public"."ulv_missions" to "anon";

grant select on table "public"."ulv_missions" to "anon";

grant trigger on table "public"."ulv_missions" to "anon";

grant truncate on table "public"."ulv_missions" to "anon";

grant update on table "public"."ulv_missions" to "anon";

grant delete on table "public"."ulv_missions" to "authenticated";

grant insert on table "public"."ulv_missions" to "authenticated";

grant references on table "public"."ulv_missions" to "authenticated";

grant select on table "public"."ulv_missions" to "authenticated";

grant trigger on table "public"."ulv_missions" to "authenticated";

grant truncate on table "public"."ulv_missions" to "authenticated";

grant update on table "public"."ulv_missions" to "authenticated";

grant delete on table "public"."ulv_missions" to "service_role";

grant insert on table "public"."ulv_missions" to "service_role";

grant references on table "public"."ulv_missions" to "service_role";

grant select on table "public"."ulv_missions" to "service_role";

grant trigger on table "public"."ulv_missions" to "service_role";

grant truncate on table "public"."ulv_missions" to "service_role";

grant update on table "public"."ulv_missions" to "service_role";

grant delete on table "public"."vehicles" to "anon";

grant insert on table "public"."vehicles" to "anon";

grant references on table "public"."vehicles" to "anon";

grant select on table "public"."vehicles" to "anon";

grant trigger on table "public"."vehicles" to "anon";

grant truncate on table "public"."vehicles" to "anon";

grant update on table "public"."vehicles" to "anon";

grant delete on table "public"."vehicles" to "authenticated";

grant insert on table "public"."vehicles" to "authenticated";

grant references on table "public"."vehicles" to "authenticated";

grant select on table "public"."vehicles" to "authenticated";

grant trigger on table "public"."vehicles" to "authenticated";

grant truncate on table "public"."vehicles" to "authenticated";

grant update on table "public"."vehicles" to "authenticated";

grant delete on table "public"."vehicles" to "service_role";

grant insert on table "public"."vehicles" to "service_role";

grant references on table "public"."vehicles" to "service_role";

grant select on table "public"."vehicles" to "service_role";

grant trigger on table "public"."vehicles" to "service_role";

grant truncate on table "public"."vehicles" to "service_role";

grant update on table "public"."vehicles" to "service_role";


  create policy "delete: own group manager or own records"
  on "public"."address_tags"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."address_tags"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."address_tags"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."address_tags"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own if collector, all if manager"
  on "public"."addresses"
  as permissive
  for delete
  to authenticated
using (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)));



  create policy "insert: group collectors"
  on "public"."addresses"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: group data"
  on "public"."addresses"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own if collector, all if manager"
  on "public"."addresses"
  as permissive
  for update
  to authenticated
using (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)))
with check (((public.user_has_group_role(group_id, 4) AND (created_by = ( SELECT auth.uid() AS uid))) OR public.user_has_group_role(group_id, 3)));



  create policy "delete: own group manager or own records"
  on "public"."aerial_inspections"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."aerial_inspections"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."aerial_inspections"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."aerial_inspections"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: group admin"
  on "public"."aerial_sites"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: group admin"
  on "public"."aerial_sites"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."aerial_sites"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group admin"
  on "public"."aerial_sites"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group manager"
  on "public"."catch_basin_missions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."catch_basin_missions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."catch_basin_missions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."catch_basin_missions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own groups collector"
  on "public"."collection_results"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 4));



  create policy "insert: own groups collector"
  on "public"."collection_results"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."collection_results"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own groups collector"
  on "public"."collection_results"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."densities"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."densities"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups"
  on "public"."densities"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."densities"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."flight_aerial_sites"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."flight_aerial_sites"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."flight_aerial_sites"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."flight_aerial_sites"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."flight_batches"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."flight_batches"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."flight_batches"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."flight_batches"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."flights"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."flights"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."flights"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."flights"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager or own records"
  on "public"."hand_ulvs"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."hand_ulvs"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."hand_ulvs"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."hand_ulvs"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."insecticide_batches"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."insecticide_batches"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups"
  on "public"."insecticide_batches"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."insecticide_batches"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager or own records"
  on "public"."landing_rates"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."landing_rates"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."landing_rates"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."landing_rates"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."notifications"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."notifications"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."notifications"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."notifications"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: group admin"
  on "public"."region_folders"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: group admin"
  on "public"."region_folders"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: group data"
  on "public"."region_folders"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: group admin"
  on "public"."region_folders"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "delete: own group manager"
  on "public"."route_items"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."route_items"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."route_items"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."route_items"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager"
  on "public"."routes"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."routes"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."routes"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."routes"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group manager or own records"
  on "public"."sample_results"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."sample_results"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."sample_results"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."sample_results"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager or own records"
  on "public"."samples"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."samples"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."samples"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."samples"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: none"
  on "public"."tag_groups"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "insert: none"
  on "public"."tag_groups"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "select: all"
  on "public"."tag_groups"
  as permissive
  for select
  to authenticated
using (true);



  create policy "update: none"
  on "public"."tag_groups"
  as permissive
  for update
  to authenticated
using (false)
with check (false);



  create policy "select: own groups"
  on "public"."trap_lures"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "select: own groups"
  on "public"."trap_types"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "delete: own group manager or own records"
  on "public"."truck_ulvs"
  as permissive
  for delete
  to authenticated
using ((public.user_has_group_role(group_id, 3) OR public.user_owns_record(created_by)));



  create policy "insert: own group collector"
  on "public"."truck_ulvs"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 4));



  create policy "select: own groups"
  on "public"."truck_ulvs"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group collector"
  on "public"."truck_ulvs"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));



  create policy "delete: own group manager"
  on "public"."ulv_missions"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 3));



  create policy "insert: own group manager"
  on "public"."ulv_missions"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 3));



  create policy "select: own groups or group_id is null"
  on "public"."ulv_missions"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group manager"
  on "public"."ulv_missions"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));



  create policy "delete: own group admin"
  on "public"."vehicles"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: own group admin"
  on "public"."vehicles"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "select: own groups"
  on "public"."vehicles"
  as permissive
  for select
  to authenticated
using (public.user_is_group_member(group_id));



  create policy "update: own group admin"
  on "public"."vehicles"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



  create policy "insert: group owners"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((public.user_has_group_role(group_id, 1) AND (user_id IS NOT NULL)));


CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.additional_personnel FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.address_tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.address_tags FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.addresses FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.aerial_inspections FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.aerial_inspections FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.aerial_sites FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.aerial_sites FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.catch_basin_missions FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.catch_basin_missions FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.collection_results FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.collection_results FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.densities FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.densities FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.flight_aerial_sites FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.flight_aerial_sites FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.flight_batches FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.flight_batches FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.flights FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.flights FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.habitat_tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.habitats FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.hand_ulvs FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.hand_ulvs FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.insecticide_batches FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.insecticide_batches FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.insecticides FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.landing_rates FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.landing_rates FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER prevent_self_role_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.region_folders FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.region_folders FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.route_items FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.route_items FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.routes FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.sample_results FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.sample_results FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.samples FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.samples FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.service_request_tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.trap_lures FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.trap_tags FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.trap_types FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.traps FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.truck_ulvs FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.truck_ulvs FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.ulv_missions FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.ulv_missions FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();

CREATE TRIGGER set_audit_fields BEFORE INSERT OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER soft_delete_trigger BEFORE DELETE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION simmer.soft_delete();


