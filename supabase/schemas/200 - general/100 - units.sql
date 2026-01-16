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
    unit_type unit_type not null,
    unit_system unit_system,

    -- This column holds the ID of the Base Unit for this type (e.g., 'Gram' for 'Kilogram')
    base_unit_id uuid references public.units(id),

    -- The factor to multiply by to convert *to* the base unit
    -- Example: For 'Kilogram', factor is 1000. For 'Ounce', factor is 0.0283495 (to kg)
    conversion_factor numeric not null,

    -- Optional: Stores the offset for non-linear conversions (e.g., temperature)
    conversion_offset numeric default 0.0 not null,
    
    created_at timestamp with time zone default now() not null,

    -- Base Units must reference themselves and have a factor of 1
    constraint check_base_unit_conversion check (
        (base_unit_id is null and conversion_factor = 1.0 and conversion_offset = 0.0) or
        (base_unit_id is not null and conversion_factor != 0.0)
    ),

    -- Ensure base_unit_id is null only for *true* base units
    constraint base_unit_self_reference check (
        (base_unit_id = id and conversion_factor = 1.0) or base_unit_id != id
    )
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

create trigger soft_delete_trigger
before delete on public.units
for each row
execute function simmer.soft_delete();