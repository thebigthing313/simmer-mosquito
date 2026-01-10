create or replace function simmer.set_created_by ()
returns trigger
language plpgsql
set search_path=''
security definer as $$
    begin
        if TG_OP = 'INSERT' then
            new.created_by = auth.uid();
        end if;
        return new;
    end;
$$;