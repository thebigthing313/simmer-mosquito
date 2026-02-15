create table public.landing_rates (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public."groups"(id) on delete restrict on update cascade,
	address_id uuid references public.addresses(id) on delete restrict on update cascade,
	feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
	landing_rate_by uuid not null references public.profiles (user_id) on delete set null on update cascade,
	landing_rate_date date not null,
	started_at timestamptz null,
	stopped_at timestamptz null,
	sample_name text null,
	observed_count int4 default 0 not null,
	duration_amount int4 null,
	duration_unit_id uuid references public.units(id) on delete restrict on update cascade,
	temperature int4 null,
	temperature_unit_id uuid references public.units(id) on delete restrict on update cascade,
	wind_speed float8 null,
	wind_speed_unit_id uuid references public.units(id) on delete restrict on update cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
	constraint landing_rates_check check ((((temperature_unit_id is null) and (temperature is null)) or ((temperature_unit_id is not null) and (temperature is not null)))),
	constraint stopped_after_started check (((started_at is null) or (stopped_at is null) or (stopped_at > started_at))),
	constraint unit_for_duration check ((((duration_unit_id is null) and (duration_amount is null)) or ((duration_unit_id is not null) and (duration_amount is not null)))),
	constraint unit_for_wind_speed check ((((wind_speed_unit_id is null) and (wind_speed is null)) or ((wind_speed_unit_id is not null) and (wind_speed is not null))))
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