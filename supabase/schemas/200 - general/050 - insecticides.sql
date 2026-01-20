create type public.insecticide_type as enum ('larvicide', 'adulticide', 'pupicide', 'other');

create table public.insecticides(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    name text not null,
    type public.insecticide_type not null,
    active_ingredient text not null,
    epa_registration_number text not null,
    default_usage_unit_id uuid not null references public.units(id) on delete restrict,
    label_url text,
    msds_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint insecticide_name_unique unique (group_id, name)
);

create trigger handle_created_trigger before insert on public.insecticides for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.insecticides for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

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