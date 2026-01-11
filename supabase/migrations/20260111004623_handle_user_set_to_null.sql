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
        -- Determine which user_id to work with
        if TG_OP = 'DELETE' then
            v_user_id := OLD.user_id;
        elsif TG_OP = 'UPDATE' and NEW.user_id is null and OLD.user_id is not null then
            -- Handle case where user_id is being set to null
            v_user_id := OLD.user_id;
        else
            v_user_id := NEW.user_id;
        end if;

        if v_user_id is not null then
            -- Get the current raw_app_meta_data, or default to '{}'
            select coalesce(raw_app_meta_data, '{}'::jsonb) into v_app_meta
            from auth.users
            where id = v_user_id;

            if TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and NEW.user_id is null) then
                -- Remove the profile_id and group_id fields
                v_app_meta := v_app_meta - 'profile_id' - 'group_id';
            else
                -- Update the profile_id and group_id fields
                v_app_meta := jsonb_set(v_app_meta, '{profile_id}', to_jsonb(NEW.id::text), true);
                v_app_meta := jsonb_set(v_app_meta, '{group_id}', to_jsonb(NEW.group_id::text), true);
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


