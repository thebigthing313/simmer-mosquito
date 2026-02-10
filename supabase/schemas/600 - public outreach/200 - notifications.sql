create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    address_id uuid not null references public.addresses(id) on delete restrict on update cascade,
    contact_id uuid not null references public.contacts(id) on delete restrict on update cascade,
    has_bees boolean not null default false,
    is_active boolean not null default true,
    is_no_spray boolean not null default false,
    radius integer,
    radius_unit_id uuid references public.units(id) on delete restrict on update cascade,
    region_id uuid references public.regions(id) on delete restrict on update cascade,
    wants_email boolean not null default false,
    wants_fax boolean not null default false,
    wants_phone boolean not null default false,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint minimum_one_contact_method check (
         (wants_email::int + wants_fax::int + wants_phone::int) >= 1
    ),
    constraint radius_unit_required_if_radius check (
        (radius is null and radius_unit_id is null) or (radius is not null and radius_unit_id is not null)
    )
);

create trigger set_audit_fields
before insert or update on public.notifications
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.notifications
for each row
execute function simmer.soft_delete();

alter table public.notifications enable row level security;

create policy "select: own groups or group_id is null"
on public.notifications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.notifications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.notifications
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.notifications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));