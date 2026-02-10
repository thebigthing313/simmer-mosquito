create table public.insecticide_batches (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    insecticide_id uuid not null references public.insecticides(id) on delete restrict on update cascade,
    batch_name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint unique_batch_name unique (group_id, insecticide_id, batch_name)
);

create trigger set_audit_fields
before insert or update on public.insecticide_batches
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.insecticide_batches
for each row
execute function simmer.soft_delete();

alter table public.insecticide_batches enable row level security;

create policy "select: own groups"
on public.insecticide_batches
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.insecticide_batches
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.insecticide_batches
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.insecticide_batches
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));