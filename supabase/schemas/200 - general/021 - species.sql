create table public.species(
    id uuid primary key default gen_random_uuid(),
    genus_id uuid references public.genera(id) on delete restrict on update cascade,
    species_name text not null unique,
    description text
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