create table public.catch_basin_missions (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public.groups(id) on delete restrict on update cascade,
	feature_id uuid null references public.spatial_features(id) on delete restrict on update cascade,
	basin_count int4 not null,
	sample_dry int2 null,
	sample_wet int2 null,
	notes text null,
	created_at timestamptz default now() not null,
	created_by uuid null references public.profiles(user_id) on delete set null on update cascade,
	updated_at timestamptz default now() not null,
	updated_by uuid null references public.profiles(user_id) on delete set null on update cascade,
	constraint catch_basin_missions_check check ((basin_count > 0))
);

create trigger set_audit_fields
before insert or update on public.catch_basin_missions
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.catch_basin_missions
for each row
execute function simmer.soft_delete();

alter table public.catch_basin_missions enable row level security;

create policy "select: own groups or group_id is null"
on public.catch_basin_missions
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.catch_basin_missions
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.catch_basin_missions
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.catch_basin_missions
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));