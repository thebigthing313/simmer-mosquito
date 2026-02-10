create table if not exists public.profiles (
    id uuid not null default gen_random_uuid() primary key,
    group_id uuid not null references public.groups (id) on delete restrict on update cascade,
    user_id uuid not null,
    role_id integer references public.roles (id) on delete restrict on update cascade,
    full_name text not null,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    unique (user_id)
);

create trigger set_audit_fields
before insert or update on public.profiles
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.profiles
for each row
execute function simmer.soft_delete();

create or replace function simmer.ids_to_app_metadata()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
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
$$;

create trigger ids_to_app_metadata_trigger
after insert or update or delete
on public.profiles
for each row
execute function simmer.ids_to_app_metadata ();

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
with check (public.user_has_group_role(group_id, 1) and user_id is not null);

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