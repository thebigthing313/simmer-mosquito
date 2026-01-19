create table public.service_requests(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    complainant_id uuid not null references public.contacts(id) on delete restrict,
    complainant_location_id uuid references public.locations(id) on delete set null,
    complaint_location_id uuid not null references public.locations(id) on delete restrict,
    request_date date not null,
    complaint_details text not null,
    is_closed boolean not null default false,
    closing_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.service_requests for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.service_requests for each row
execute function public.set_updated_record_fields ();

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