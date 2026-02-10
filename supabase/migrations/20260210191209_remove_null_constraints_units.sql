alter table "public"."units" alter column unit_type type "public"."unit_type" using unit_type::text::"public"."unit_type";

alter table "public"."route_items" alter column "rank_string" set data type text collate "C" using "rank_string"::text;

alter table "public"."units" alter column "conversion_factor" drop not null;

alter table "public"."units" alter column "conversion_factor" set data type double precision using "conversion_factor"::double precision;

alter table "public"."units" alter column "conversion_offset" drop default;

alter table "public"."units" alter column "conversion_offset" drop not null;

alter table "public"."units" alter column "conversion_offset" set data type double precision using "conversion_offset"::double precision;

alter table "public"."units" alter column "unit_type" drop not null;

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


