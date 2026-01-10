create or replace function public.set_updated_record_fields ()
returns trigger
language plpgsql
set search_path = ''
security invoker
as $$
    begin
        if TG_OP = 'UPDATE' then
            new.updated_at = now();
            new.updated_by = auth.uid();
        end if;

        return new;
    end;
$$;