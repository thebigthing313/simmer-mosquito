create type public.aerial_result_type as enum (
    'recheck', 'fly', 'hand treat', 'no action'
);
create table public.aerial_inspections(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    aerial_site_id uuid not null references public.aerial_sites(id) on delete restrict on update cascade,
    inspected_by uuid not null references public.profiles (user_id) on delete restrict on update cascade,
    inspection_date date not null,
    is_wet boolean not null default false,
    result public.aerial_result_type not null,
    density_id uuid references public.densities(id) on delete restrict on update cascade,
    dips_count integer,
    larvae_count integer,
    larvae_per_dip double precision,
    notes text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint larval_data_present check (
        is_wet = false OR (
            is_wet = true AND (
                (larvae_count IS NOT NULL AND dips_count IS NOT NULL) 
                OR (larvae_per_dip IS NOT NULL) 
                OR (density_id is not null)
            )
        )
    )
);

create trigger set_audit_fields
before insert or update on public.aerial_inspections
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.aerial_inspections
for each row
execute function simmer.soft_delete();
alter table public.aerial_inspections enable row level security;

create policy "select: own groups"
on public.aerial_inspections
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.aerial_inspections
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.aerial_inspections
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.aerial_inspections
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));