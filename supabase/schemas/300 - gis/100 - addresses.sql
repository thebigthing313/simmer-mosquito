create table public.addresses (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    display_name text not null,
    address_fields jsonb not null,
    feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);

create trigger set_audit_fields
before insert or update on public.addresses
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.addresses
for each row
execute function simmer.soft_delete();

alter table public.addresses enable row level security;

create policy "select: group data"
on public.addresses
for select
to authenticated
using (public.user_is_group_member (group_id));

create policy "insert: group collectors"
on public.addresses
for insert
to authenticated
with check (public.user_has_group_role (group_id, 4));

create policy "update: own if collector, all if manager"
on public.addresses
for update
to authenticated
using (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3))
with check (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3));

create policy "delete: own if collector, all if manager"
on public.addresses
for delete
to authenticated
using (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3))

