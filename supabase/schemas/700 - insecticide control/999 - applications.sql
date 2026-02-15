create table public.applications (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public.groups(id) on delete restrict on update cascade,
	applicator_id uuid not null references public.profiles (user_id) on delete restrict on update cascade,
	application_date date not null,
	feature_id uuid null references public.spatial_features(id) on delete restrict on update cascade,
	equipment_id uuid null references public.equipment(id) on delete restrict on update cascade,
	insecticide_id uuid not null references public.insecticides(id) on delete restrict on update cascade,
	batch_id uuid null references public.insecticide_batches(id) on delete restrict on update cascade,
	application_method_id uuid null references public.application_methods(id) on delete restrict on update cascade,
	amount_applied float8 not null,
	application_unit_id uuid not null references public.units(id) on delete restrict on update cascade,
	--- originating records
	inspection_id uuid null references public.inspections(id) on delete restrict on update cascade,
	flight_aerial_site_id uuid null references public.flight_aerial_sites(id) on delete restrict on update cascade,
	catch_basin_mission_id uuid null references public.catch_basin_missions(id) on delete restrict on update cascade,
	handheld_applications_id uuid null references public.handheld_applications(id) on delete restrict on update cascade,
	truck_applications uuid null references public.truck_applications(id) on delete restrict on update cascade,
	---
	created_at timestamptz default now() not null,
	created_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	updated_at timestamptz default now() not null,
	updated_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	constraint amount_applied_positive check ((amount_applied > (0)::double precision)),
	constraint applications_check check ((((((((inspection_id is not null))::integer + ((flight_aerial_site_id is not null))::integer) + ((catch_basin_mission_id is not null))::integer) + ((truck_applications is not null))::integer) + ((handheld_applications_id is not null))::integer) = 1)),
	constraint one_originating_table check ((((((((inspection_id is not null))::integer + ((flight_aerial_site_id is not null))::integer) + ((catch_basin_mission_id is not null))::integer) + ((truck_applications is not null))::integer) + ((handheld_applications_id is not null))::integer) = 1))
);

comment on column public.applications.inspection_id is 'polymorphic';
comment on column public.applications.flight_aerial_site_id is 'polymorphic';
comment on column public.applications.catch_basin_mission_id is 'polymorphic';
comment on column public.applications.handheld_applications_id is 'polymorphic';
comment on column public.applications.truck_applications is 'polymorphic';

create trigger set_audit_fields
before insert or update on public.applications
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.applications
for each row
execute function simmer.soft_delete();

alter table public.applications enable row level security;

create policy "select: own groups"
on public.applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));