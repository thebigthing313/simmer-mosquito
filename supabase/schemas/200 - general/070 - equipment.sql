create table public.equipment (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    equipment_name text not null,
    serial_number text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint unique_equipment_name_serial_number unique (group_id, equipment_name, serial_number)
);

create trigger set_audit_fields
before insert or update on public.equipment
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.equipment
for each row
execute function simmer.soft_delete();

alter table public.equipment enable row level security;

create policy "select: own groups"
on public.equipment
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group admin"
on public.equipment
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: own group admin"
on public.equipment
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: own group admin"
on public.equipment
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));