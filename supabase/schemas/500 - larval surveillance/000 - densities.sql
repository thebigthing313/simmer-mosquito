create table public.densities (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    density_name text not null,
    range_max integer,
    range_min integer,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint range_valid check (range_min < range_max)
);

create trigger set_audit_fields
before insert or update on public.densities
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.densities
for each row
execute function simmer.soft_delete();

alter table public.densities enable row level security;

create policy "select: own groups"
on public.densities
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.densities
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.densities
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.densities
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));