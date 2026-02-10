create table public.hand_ulvs (
    id uuid primary key default gen_random_uuid(),
    address_id uuid references public.addresses(id) on delete set null on update cascade,
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    lat double precision,
    lng double precision,
    start_time time,
    end_time time,
    start_temperature integer,
    end_temperature integer,
    temperature_unit_id uuid references public.units(id) on delete restrict on update cascade,
    start_wind_speed double precision,
    end_wind_speed double precision,
    wind_speed_unit_id uuid references public.units(id) on delete restrict on update cascade,
    notes text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint unit_for_temperature check (
        (temperature_unit_id is null and ((start_temperature is null) and (end_temperature is null))) or
        (temperature_unit_id is not null and ((start_temperature is not null) or (end_temperature is not null)))
    ),
    constraint unit_for_wind_speed check (
        (wind_speed_unit_id is null and ((start_wind_speed is null) and (end_wind_speed is null))) or
        (wind_speed_unit_id is not null and ((start_wind_speed is not null) or (end_wind_speed is not null)))
    )
);

create trigger set_audit_fields
before insert or update on public.hand_ulvs
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.hand_ulvs
for each row
execute function simmer.soft_delete();

alter table public.hand_ulvs enable row level security;

create policy "select: own groups"
on public.hand_ulvs
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.hand_ulvs
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.hand_ulvs
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.hand_ulvs
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));