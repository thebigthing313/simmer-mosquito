create table public.habitats (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    feature_id uuid not null references public.spatial_features(id) on delete restrict on update cascade,
    description text not null,
    habitat_name text,
    is_active boolean not null default true,
    is_inaccessible boolean not null default false,
    address_id uuid references public.addresses(id) on delete set null on update cascade,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);

create trigger set_audit_fields
before insert or update on public.habitats
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.habitats
for each row
execute function simmer.soft_delete();

alter table public.habitats enable row level security;

create policy "select: own groups"
on public.habitats
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.habitats
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.habitats
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups manager"
on public.habitats
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));