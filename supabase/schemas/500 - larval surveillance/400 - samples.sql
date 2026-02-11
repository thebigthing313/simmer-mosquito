create table public.samples(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    inspection_id uuid not null references public.inspections(id) on delete restrict on update cascade,
    display_id text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);


create trigger set_audit_fields
before insert or update on public.samples
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.samples
for each row
execute function simmer.soft_delete();
alter table public.samples enable row level security;

create policy "select: own groups"
on public.samples
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.samples
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.samples
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.samples
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));