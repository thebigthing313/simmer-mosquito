create table public.application_methods (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    method_name text not null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint unique_method_name unique (group_id, method_name)
);

create trigger set_audit_fields
before insert or update on public.application_methods
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.application_methods
for each row
execute function simmer.soft_delete();

alter table public.application_methods enable row level security;

create policy "select: own groups"
on public.application_methods
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group admin"
on public.application_methods
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: own group admin"
on public.application_methods
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: own group admin"
on public.application_methods
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));