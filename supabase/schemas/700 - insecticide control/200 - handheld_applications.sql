create table public.handheld_applications (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public."groups"(id) on delete restrict on update cascade,
	feature_id uuid null references public.spatial_features(id) on delete restrict on update cascade,
	address_id uuid null references public.addresses(id) on delete restrict on update cascade,
	start_time time null,
	end_time time null,
	start_temperature int4 null,
	end_temperature int4 null,
	temperature_unit_id uuid null references public.units(id) on delete restrict on update cascade,
	start_wind_speed float8 null,
	end_wind_speed float8 null,
	wind_speed_unit_id uuid null references public.units(id) on delete restrict on update cascade,
	notes text null,
	created_at timestamptz default now() not null,
	created_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	updated_at timestamptz default now() not null,
	updated_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	constraint handheld_temp_unit_check check ((((temperature_unit_id is null) and ((start_temperature is null) and (end_temperature is null))) or ((temperature_unit_id is not null) and ((start_temperature is not null) or (end_temperature is not null))))),
	constraint handheld_wind_unit_check check ((((wind_speed_unit_id is null) and ((start_wind_speed is null) and (end_wind_speed is null))) or ((wind_speed_unit_id is not null) and ((start_wind_speed is not null) or (end_wind_speed is not null)))))
);

create trigger set_audit_fields
before insert or update on public.handheld_applications
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.handheld_applications
for each row
execute function simmer.soft_delete();

alter table public.handheld_applications enable row level security;

create policy "select: own groups"
on public.handheld_applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.handheld_applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.handheld_applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.handheld_applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));