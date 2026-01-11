
  create table "public"."roles" (
    "id" integer not null,
    "role_name" text not null,
    "description" text
      );


alter table "public"."roles" enable row level security;

alter table "public"."profiles" add column "role_id" integer;

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX roles_role_name_key ON public.roles USING btree (role_name);

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."profiles" add constraint "profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT not valid;

alter table "public"."profiles" validate constraint "profiles_role_id_fkey";

alter table "public"."roles" add constraint "roles_role_name_key" UNIQUE using index "roles_role_name_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION simmer.ids_to_app_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    declare
        v_app_meta jsonb;
        v_user_id uuid;
    begin
        -- Determine which user_id to work with for cleanup
        if TG_OP = 'DELETE' then
            v_user_id := OLD.user_id;
        elsif TG_OP = 'UPDATE' and (NEW.user_id is null or NEW.role_id is null) and OLD.user_id is not null then
            -- Handle case where user_id or role_id is being set to null
            v_user_id := OLD.user_id;
        else
            v_user_id := NEW.user_id;
        end if;

        if v_user_id is not null then
            -- Get the current raw_app_meta_data, or default to '{}'
            select coalesce(raw_app_meta_data, '{}'::jsonb) into v_app_meta
            from auth.users
            where id = v_user_id;

            -- All or nothing: only set metadata if user_id AND role_id are both present
            if TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and (NEW.user_id is null or NEW.role_id is null)) then
                -- Remove the profile_id, group_id, and role_id fields
                v_app_meta := v_app_meta - 'profile_id' - 'group_id' - 'role_id';
            elsif NEW.user_id is not null and NEW.role_id is not null then
                -- Update all three fields (all or nothing)
                v_app_meta := jsonb_set(v_app_meta, '{profile_id}', to_jsonb(NEW.id::text), true);
                v_app_meta := jsonb_set(v_app_meta, '{group_id}', to_jsonb(NEW.group_id::text), true);
                v_app_meta := jsonb_set(v_app_meta, '{role_id}', to_jsonb(NEW.role_id), true);
            end if;

            -- Write new metadata into auth.users(raw_app_meta_data)
            update auth.users
            set raw_app_meta_data = v_app_meta
            where id = v_user_id;
        end if;

        if TG_OP = 'DELETE' then
            return OLD;
        else
            return NEW;
        end if;
    end;
$function$
;

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";


  create policy "delete: none"
  on "public"."roles"
  as permissive
  for delete
  to public
using (false);



  create policy "insert: none"
  on "public"."roles"
  as permissive
  for insert
  to public
with check (false);



  create policy "read: allow all"
  on "public"."roles"
  as permissive
  for select
  to public
using (true);



  create policy "update: none"
  on "public"."roles"
  as permissive
  for update
  to public
using (false)
with check (false);



