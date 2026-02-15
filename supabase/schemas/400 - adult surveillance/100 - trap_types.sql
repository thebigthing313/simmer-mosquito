create table public.trap_types (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    trap_type_name text not null,
    shorthand text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint trap_type_name_unique unique (group_id, trap_type_name)
);

create trigger set_audit_fields
before insert or update on public.trap_types
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.trap_types
for each row
execute function simmer.soft_delete();

alter table public.trap_types enable row level security;

create policy "select: own groups"
on public.trap_types
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group admin"
on public.trap_types
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: group admin"
on public.trap_types
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: group admin"
on public.trap_types
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));