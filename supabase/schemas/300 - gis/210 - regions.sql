create table if not exists public.regions (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups (id) on delete restrict on update cascade,
    region_name text not null,
    region_folder_id uuid references public.region_folders (id) on delete set null on update cascade,
    feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
    parent_id uuid references public.regions (id) on delete set null on update cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    metadata jsonb,
    name_path text,
    constraint regions_parent_check check (id<>parent_id)
);

create trigger set_audit_fields
before insert or update on public.regions
for each row
execute function public.set_audit_fields();

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

create policy "insert: group admin"
on public.regions
for insert
to authenticated
with check (public.user_has_group_role (group_id, 2));

create policy "update: group admin"
on public.regions
for update
to authenticated
using (public.user_has_group_role (group_id, 2))
with check (public.user_has_group_role (group_id, 2));

create policy "delete: group admin"
on public.regions
for delete
to authenticated
using (public.user_has_group_role (group_id, 2));