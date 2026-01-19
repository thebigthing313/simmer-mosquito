create table public.genera (
    id uuid primary key default gen_random_uuid(),
    genus_name text not null unique,
    abbreviation text not null unique,
    description text,
    created_at timestamp with time zone default now() not null
);

alter table public.genera enable row level security;

create policy "select: anyone"
on public.genera
for select
to public
using (true);

create policy "insert: none"
on public.genera
for insert
to public
with check (false);

create policy "update: none"
on public.genera
for update
to public
using (false)
with check (false);

create policy "delete: none"
on public.genera
for delete
to public
using (false);

create trigger soft_delete_trigger
before delete on public.genera
for each row
execute function simmer.soft_delete();