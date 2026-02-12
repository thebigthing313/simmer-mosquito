create type public.service_request_source as enum ('online', 'phone', 'walk-in', 'other');

create table public.service_requests(
    id uuid primary key default gen_random_uuid(),
    display_number integer not null,
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    contact_id uuid not null references public.contacts(id) on delete restrict on update cascade,
    address_id uuid not null references public.addresses(id) on delete restrict on update cascade,
    request_date date not null,
    details text not null,
    is_closed boolean not null default false,
    source public.service_request_source default 'online'::public.service_request_source,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
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