create table public.additional_personnel(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    personnel_id uuid not null references public.profiles(user_id) on delete cascade on update cascade,
    --- originating tables
    inspection_id uuid references public.inspections(id) on delete cascade on update cascade,
    aerial_inspection_id uuid references public.aerial_inspections(id) on delete cascade on update cascade,
    flight_id uuid references public.flights(id) on delete cascade on update cascade,
    application_id uuid references public.applications(id) on delete cascade on update cascade,
    ----------------------
    parent_table_name text generated always as (
    case
        when inspection_id is not null then 'inspections'::text
        when aerial_inspection_id is not null then 'aerial_inspections'::text
        when flight_id is not null then 'flights'::text
        when application_id is not null then 'applications'::text
        else null::text
    end) STORED null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint one_parent_table_reference check (
        (inspection_id is not null)::int +
        (aerial_inspection_id is not null)::int +
        (flight_id is not null)::int +
        (application_id is not null)::int = 1
    )
);

comment on column public.additional_personnel.inspection_id is 'polymorphyic';
comment on column public.additional_personnel.aerial_inspection_id is 'polymorphyic';
comment on column public.additional_personnel.flight_id is 'polymorphyic';
comment on column public.additional_personnel.application_id is 'polymorphyic';

create trigger set_audit_fields
before insert or update on public.additional_personnel
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.additional_personnel
for each row
execute function simmer.soft_delete();


alter table public.additional_personnel enable row level security;

create policy "select: group members"
on public.additional_personnel
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group members"
on public.additional_personnel
for insert
to authenticated
with check (public.user_is_group_member(group_id));

create policy "update: group managers or record creators"
on public.additional_personnel
for update
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);

create policy "delete: group managers or record creators"
on public.additional_personnel
for delete
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);