create table public.truck_applications (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public."groups"(id) on delete restrict on update cascade,
	feature_id uuid null references public.spatial_features(id) on delete restrict on update cascade,
	area_description text null,
	start_time time null,
	start_odometer float8 null,
	start_temperature float8 null,
	start_wind_speed float8 null,
	end_time time null,
	end_odometer float8 null,
	end_temperature float8 null,
	end_wind_speed float8 null,
	vehicle_id uuid null references public.vehicles(id) on delete restrict on update cascade,
	temperature_unit_id uuid null references public.units(id) on delete restrict on update cascade,
	wind_speed_unit_id uuid null references public.units(id) on delete restrict on update cascade,
	notes text null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
	CONSTRAINT truck_applications_temp_check CHECK ((((temperature_unit_id IS NULL) AND ((start_temperature IS NULL) AND (end_temperature IS NULL))) OR ((temperature_unit_id IS NOT NULL) AND ((start_temperature IS NOT NULL) OR (end_temperature IS NOT NULL))))),
	CONSTRAINT truck_applications_wind_check CHECK ((((wind_speed_unit_id IS NULL) AND ((start_wind_speed IS NULL) AND (end_wind_speed IS NULL))) OR ((wind_speed_unit_id IS NOT NULL) AND ((start_wind_speed IS NOT NULL) OR (end_wind_speed IS NOT NULL))))),
	CONSTRAINT valid_time_range CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time)))
);

create trigger set_audit_fields
before insert or update on public.truck_applications
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.truck_applications
for each row
execute function simmer.soft_delete();

alter table public.truck_applications enable row level security;

create policy "select: own groups"
on public.truck_applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.truck_applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.truck_applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.truck_applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));