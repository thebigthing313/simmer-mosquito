-- Prevent users from changing their own role_id to escalate privileges
-- This trigger ensures users cannot grant themselves higher permissions

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer
as $$
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
$$;

create trigger prevent_self_role_escalation
before update on public.profiles
for each row
execute function public.prevent_self_role_change();
