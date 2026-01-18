create table public.larval_densities (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    range_start integer not null,
    range_end integer not null,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint range_valid check (range_start < range_end)
);

create trigger handle_created_trigger before insert on public.larval_densities for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.larval_densities for each row
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.larval_densities
for each row
execute function simmer.soft_delete();

alter table public.larval_densities enable row level security;

create policy "select: own groups"
on public.larval_densities
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.larval_densities
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.larval_densities
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.larval_densities
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));