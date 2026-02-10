create table public.inspections (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    habitat_id uuid not null references public.habitats(id) on delete restrict on update cascade,
    inspection_date date not null,
    inspected_by uuid references public.profiles (user_id) on delete restrict on update cascade,
    is_wet boolean not null default false,
    dip_count integer,
    larvae_count integer,
    density_id uuid references public.densities (id) on delete restrict on update cascade,
    has_eggs boolean not null default false,
    has_first_instar boolean not null default false,
    has_second_instar boolean not null default false,
    has_third_instar boolean not null default false,
    has_fourth_instar boolean not null default false,
    has_pupae boolean not null default false,
    is_source_reduction boolean not null default false,
    source_reduction_notes text,
    notes text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,   
    constraint data_integrity check (
        (is_wet = false) OR 
            (
                (larvae_count IS NOT NULL AND dip_count IS NOT NULL) OR
                (density_id IS NOT NULL) OR
                (larvae_count IS NULL AND density_id IS NULL)
            )
    ),
    constraint source_reduction_notes_check check (
        (is_source_reduction = false) or 
        (source_reduction_notes is not null and source_reduction_notes <> '')
    )
);

create trigger set_audit_fields
before insert or update on public.inspections
for each row
execute function public.set_audit_fields();

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