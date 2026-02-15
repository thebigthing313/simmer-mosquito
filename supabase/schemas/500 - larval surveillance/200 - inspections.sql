create table public.inspections (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public.groups(id) on delete restrict on update cascade,
	feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
	habitat_id uuid null references public.habitats(id) on delete restrict on update cascade,
	inspected_by uuid not null references public.profiles (user_id) on delete set null on update cascade,
	inspection_date date not null,
	is_wet boolean default false not null,
	dip_count int2 null,
	density_id uuid null references public.densities(id) on delete restrict on update cascade,
	larvae_count int4 null,
	has_first_instar boolean default false not null,
	has_second_instar boolean default false not null,
	has_third_instar boolean default false not null,
	has_fourth_instar boolean default false not null,
	has_pupae boolean default false not null,
	has_eggs boolean default false not null,
	notes text null,
	is_source_reduction boolean default false not null,
	source_reduction_notes text null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
	constraint inspections_check check (((is_wet = false) or (((larvae_count is not null) and (dip_count is not null)) or (density_id is not null) or ((larvae_count is null) and (density_id is null))))),
	constraint inspections_check_1 check (((is_source_reduction = false) or ((source_reduction_notes is not null) and (source_reduction_notes <> ''::text))))
);

create trigger set_audit_fields
before insert or update on public.inspections
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.inspections
for each row
execute function simmer.soft_delete();
alter table public.inspections enable row level security;

create policy "select: own groups"
on public.inspections
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.inspections
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.inspections
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.inspections
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));