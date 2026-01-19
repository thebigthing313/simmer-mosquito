create table public.species(
    id uuid primary key default gen_random_uuid(),
    genus_id uuid references public.genera(id) on delete restrict,
    species_name text not null unique,
    sample_photo_url text,
    description text,
    created_at timestamp with time zone default now() not null
);

alter table public.species enable row level security;

create policy "select: anyone"
on public.species
for select
to public
using (true);

create policy "insert: none"
on public.species
for insert
to public
with check (false);

create policy "update: none"
on public.species
for update
to public
using (false)
with check (false);

create policy "delete: none"
on public.species
for delete
to public
using (false);

create trigger soft_delete_trigger
before delete on public.species
for each row
execute function simmer.soft_delete();