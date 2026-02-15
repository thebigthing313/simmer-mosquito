create table public.aerial_sites(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    aerial_site_name text not null,
    aerial_site_code text,
    is_active boolean not null default true,
    feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint unique_aerial_site_name_per_group unique (group_id, aerial_site_name)
);

create trigger set_audit_fields
before insert or update on public.aerial_sites
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.aerial_sites 
for each row
execute function simmer.soft_delete();

alter table public.aerial_sites enable row level security;

create policy "select: own groups"
on public.aerial_sites
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group admin"
on public.aerial_sites
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: group admin"
on public.aerial_sites
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: group admin"
on public.aerial_sites
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));