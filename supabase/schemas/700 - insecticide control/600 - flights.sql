create table public.flights(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    aircraft_id uuid not null references public.vehicles(id) on delete restrict on update cascade,
    flight_by uuid not null references public.profiles (user_id) on delete restrict on update cascade,
    flight_date date not null,
    metadata jsonb,
    notes text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);

create trigger set_audit_fields
before insert or update on public.flights
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.flights
for each row
execute function simmer.soft_delete();

alter table public.flights enable row level security;

create policy "select: own groups or group_id is null"
on public.flights
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.flights
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.flights
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.flights
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));