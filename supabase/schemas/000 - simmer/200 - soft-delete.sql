create table if not exists simmer.deleted_data (
    id uuid primary key default gen_random_uuid(),
    deleted_at timestamptz not null default now(),
    deleted_by uuid references auth.users (id) on delete set null,
    original_table text not null,
    original_id uuid not null,
    data jsonb not null
);

create or replace function simmer.soft_delete()
returns trigger
set search_path = ''
security definer
language plpgsql
as $$
  begin
    insert into simmer.deleted_data (original_table, original_id, deleted_by, data)
    values (TG_TABLE_NAME, OLD.id, auth.uid(), row_to_json(OLD)::jsonb);
    return OLD;
  end;
$$;