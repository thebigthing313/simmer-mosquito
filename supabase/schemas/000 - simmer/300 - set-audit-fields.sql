create or replace function public.set_audit_fields ()
returns trigger
language plpgsql
set search_path = ''
security invoker
as $$
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
$$;