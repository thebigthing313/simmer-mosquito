create table public.point_larviciding (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    habitat_id uuid not null references public.habitats(id) on delete restrict on update cascade,
    inspection_id uuid references public.inspections(id) on delete set null on update cascade,
    application_method_id uuid references public.application_methods(id) on delete restrict on update cascade,
    application_equipment_id uuid references public.equipment(id) on delete restrict on update cascade,
    application_area double precision,
    application_area_unit_id uuid references public.units(id) on delete restrict on update cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint area_and_unit check (
        (application_area is null and application_area_unit_id is null) or
        (application_area is not null and application_area_unit_id is not null)
    )
);

create trigger set_audit_fields
before insert or update on public.point_larviciding
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.point_larviciding
for each row
execute function simmer.soft_delete();

alter table public.point_larviciding enable row level security;

create policy "select: own groups"
on public.point_larviciding
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.point_larviciding
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.point_larviciding
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.point_larviciding
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));