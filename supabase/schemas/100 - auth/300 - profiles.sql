create table if not exists public.profiles (
    "id" uuid not null default gen_random_uuid() primary key,
    "group_id" uuid not null references public.groups (id) on delete restrict,
    "user_id" uuid references auth.users (id) on delete restrict,
    "role_id" integer references public.roles (id) on delete restrict,
    "first_name" text not null,
    "last_name" text not null,
    "avatar_url" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid references auth.users (id) on delete restrict,
    "updated_at" timestamp with time zone,
    "updated_by" uuid references auth.users (id) on delete restrict,
    unique (user_id)
);

create trigger handle_created_trigger
before insert
on public.profiles
for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger
before update
on public.profiles
for each row
when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create function simmer.ids_to_app_metadata ()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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
$$;

create trigger ids_to_app_metadata_trigger
after insert or update or delete
on public.profiles
for each row
execute function simmer.ids_to_app_metadata ();

create trigger soft_delete_trigger
before delete
on public.profiles
for each row
execute function simmer.soft_delete();

create function simmer.prevent_user_id_change ()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
    begin
        if OLD.user_id IS DISTINCT FROM NEW.user_id then
            raise exception 'Cannot change user_id on profiles';
        end if;
        return NEW;
    end;
$$;

create trigger prevent_user_id_change_trigger
before update
on public.profiles
for each row
execute function simmer.prevent_user_id_change ();

alter table public.profiles enable row level security;

create policy "read: group members"
on public.profiles
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group owners"
on public.profiles
for insert
to authenticated
with check (public.user_has_group_role(group_id, 1) and user_id is null);

create policy "update: group owners"
on public.profiles
for update
to authenticated
using (public.user_has_group_role(group_id, 1))
with check (public.user_has_group_role(group_id, 1));

create policy "delete: group owners"
on public.profiles
for delete
to authenticated
using (public.user_has_group_role(group_id, 1));