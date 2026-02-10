create type public.insecticide_type as enum ('larvicide', 'adulticide', 'pupicide', 'other');

create table public.insecticides(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups (id) on delete restrict on update cascade,
    trade_name text not null,
    active_ingredient text not null,
    conversion_factor double precision,
    default_unit_id uuid not null references public.units(id) on delete restrict,
    type public.insecticide_type not null,
    registration_number text not null,
    label_url text,
    metadata jsonb,
    msds_url text,
    shorthand text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint insecticide_trade_name_unique unique (group_id, trade_name)
);

create trigger set_audit_fields
before insert or update on public.insecticides
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.insecticides
for each row
execute function simmer.soft_delete();

alter table public.insecticides enable row level security;

create policy "select: own groups"
on public.insecticides
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group admin"
on public.insecticides
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: own group admin"
on public.insecticides
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: own group admin"
on public.insecticides
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));