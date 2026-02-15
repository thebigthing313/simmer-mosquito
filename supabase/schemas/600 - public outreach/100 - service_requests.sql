create type public.request_intake_type as enum ('online', 'phone', 'walk-in', 'other');

create table public.service_requests (
	id uuid primary key default gen_random_uuid() not null,
	group_id uuid not null references public."groups"(id) on delete restrict on update cascade,
	display_name int4 not null,
	intake_type public."request_intake_type" not null default 'online'::request_intake_type,
	request_date date not null,
	address_id uuid not null references public.addresses(id) on delete restrict on update cascade,
	feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
	contact_id uuid not null references public.contacts(id) on delete restrict on update cascade,
	details text not null,
	created_at timestamptz default now() not null,
	created_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	updated_at timestamptz default now() not null,
	updated_by uuid null references public.profiles (user_id) on delete set null on update cascade,
	is_closed bool default false not null
);

create trigger set_audit_fields
before insert or update on public.service_requests
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.service_requests
for each row
execute function simmer.soft_delete();

alter table public.service_requests enable row level security;
create policy "select: own groups or group_id is null"
on public.service_requests
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.service_requests
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.service_requests
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.service_requests
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));