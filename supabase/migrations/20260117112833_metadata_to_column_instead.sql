drop trigger if exists "handle_created_trigger" on "public"."metadata";

drop trigger if exists "handle_updated_trigger" on "public"."metadata";

drop trigger if exists "soft_delete_trigger" on "public"."metadata";

drop policy "delete: group managers or record creators" on "public"."metadata";

drop policy "insert: group members" on "public"."metadata";

drop policy "select: group members" on "public"."metadata";

drop policy "update: group managers or record creators" on "public"."metadata";

revoke delete on table "public"."metadata" from "anon";

revoke insert on table "public"."metadata" from "anon";

revoke references on table "public"."metadata" from "anon";

revoke select on table "public"."metadata" from "anon";

revoke trigger on table "public"."metadata" from "anon";

revoke truncate on table "public"."metadata" from "anon";

revoke update on table "public"."metadata" from "anon";

revoke delete on table "public"."metadata" from "authenticated";

revoke insert on table "public"."metadata" from "authenticated";

revoke references on table "public"."metadata" from "authenticated";

revoke select on table "public"."metadata" from "authenticated";

revoke trigger on table "public"."metadata" from "authenticated";

revoke truncate on table "public"."metadata" from "authenticated";

revoke update on table "public"."metadata" from "authenticated";

revoke delete on table "public"."metadata" from "service_role";

revoke insert on table "public"."metadata" from "service_role";

revoke references on table "public"."metadata" from "service_role";

revoke select on table "public"."metadata" from "service_role";

revoke trigger on table "public"."metadata" from "service_role";

revoke truncate on table "public"."metadata" from "service_role";

revoke update on table "public"."metadata" from "service_role";

alter table "public"."metadata" drop constraint "metadata_created_by_fkey";

alter table "public"."metadata" drop constraint "metadata_group_id_fkey";

alter table "public"."metadata" drop constraint "metadata_updated_by_fkey";

alter table "public"."metadata" drop constraint "metadata_pkey";

drop index if exists "public"."metadata_pkey";

drop table "public"."metadata";


