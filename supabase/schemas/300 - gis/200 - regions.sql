create table if not exists public.regions (
    id uuid primary key default gen_random_uuid(),
    group_id uuid references public.groups (id) on delete cascade,
    region_name text not null,
    geom geometry (MultiPolygon, 4326) not null,
    parent_id uuid references public.regions (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint regions_parent_check check (id<>parent_id)
);

create trigger handle_created_trigger before insert on public.regions for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.regions for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.regions
for each row
execute function simmer.soft_delete();

alter table public.regions enable row level security;

create policy "select: group data"
on public.regions
for select
to authenticated
using (public.user_is_group_member (group_id));

create policy "insert: group manager"
on public.regions
for insert
to authenticated
with check (public.user_has_group_role (group_id, 3));

create policy "update: group manager"
on public.regions
for update
to authenticated
using (public.user_has_group_role (group_id, 3))
with check (public.user_has_group_role (group_id, 3));

create policy "delete: group manager"
on public.regions
for delete
to authenticated
using (public.user_has_group_role (group_id, 3));