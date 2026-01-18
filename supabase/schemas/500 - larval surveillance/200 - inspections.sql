create table public.inspections (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    habitat_id uuid not null references public.habitats(id) on delete restrict,
    inspection_date date not null,
    inspector_id uuid references public.profiles (id) on delete set null,
    is_wet boolean not null default false,
    dips integer,
    total_larvae integer,
    density_id uuid references public.larval_densities (id) on delete restrict,
    has_eggs boolean not null default false,
    has_1st_instar boolean not null default false,
    has_2nd_instar boolean not null default false,
    has_3rd_instar boolean not null default false,
    has_4th_instar boolean not null default false,
    has_pupae boolean not null default false,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint data_integrity check (
        (is_wet = false) OR 
        (total_larvae IS NOT NULL AND dips IS NOT NULL) OR 
        (density_id IS NOT NULL) OR
        (total_larvae IS NULL AND density_id IS NULL)
    )
);

create trigger handle_created_trigger before insert on public.inspections for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.inspections for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.inspections
for each row
execute function simmer.soft_delete();

alter table public.inspections enable row level security;

create policy "select: own groups"
on public.inspections
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.inspections
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.inspections
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.inspections
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));