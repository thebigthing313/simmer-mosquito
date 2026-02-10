create type public.unit_type as enum (
    'weight',
    'distance',
    'area',
    'volume',
    'temperature',
    'time',
    'count'
);

create type public.unit_system as enum (
    'si',
    'imperial',
    'us_customary'
);

create table public.units (
    id uuid primary key default gen_random_uuid(),
    unit_name text not null unique,
    abbreviation text not null unique,
    unit_type unit_type,
    unit_system unit_system,
    base_unit_id uuid references public.units(id) on delete restrict on update cascade,
    conversion_factor double precision,
    conversion_offset double precision
);

alter table public.units enable row level security;

create policy "select: anyone"
on public.units
for select
to public
using (true);

create policy "insert: none"
on public.units
for insert
to public
with check (false);

create policy "update: none"
on public.units
for update
to public
using (false)
with check (false);

create policy "delete: none"
on public.units
for delete
to public
using (false);