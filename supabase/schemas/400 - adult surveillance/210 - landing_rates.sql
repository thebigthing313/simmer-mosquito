create table public.landing_rates(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    landing_rate_by uuid references public.profiles(user_id) on delete restrict on update cascade,
    landing_rate_date date not null,   
    address_id uuid references public.addresses(id) on delete set null on update cascade, 
    lat double precision not null,
    lng double precision not null,
    geom geometry(Point, 4326) generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)) stored,
    started_at timestamptz,
    stopped_at timestamptz,
    duration_amount integer,
    duration_unit_id uuid references public.units(id) on delete restrict on update cascade,
    temperature integer,
    temperature_unit_id uuid references public.units(id) on delete restrict on update cascade,
    wind_speed double precision,
    wind_speed_unit_id uuid references public.units(id) on delete restrict on update cascade,
    observed_count integer not null,
    sample_id text,    
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
    constraint unit_for_duration check (
        (duration_unit_id is null and (duration_amount is null)) or
        (duration_unit_id is not null and (duration_amount is not null))
    ),
    constraint unit_for_temperature check (
        (temperature_unit_id is null and (temperature is null)) or
        (temperature_unit_id is not null and (temperature is not null))
    ),
    constraint unit_for_wind_speed check (
        (wind_speed_unit_id is null and (wind_speed is null)) or
        (wind_speed_unit_id is not null and (wind_speed is not null))
    ),
    constraint stopped_after_started check (
        (started_at is null or stopped_at is null) or
        (stopped_at > started_at)
    )
);

create trigger set_audit_fields
before insert or update on public.landing_rates
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.landing_rates
for each row
execute function simmer.soft_delete();

alter table public.landing_rates enable row level security;

create policy "select: own groups"
on public.landing_rates
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.landing_rates
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.landing_rates
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.landing_rates
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));