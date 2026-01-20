create table public.applications(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    insecticide_id uuid not null references public.insecticides(id) on delete restrict,
    application_date date not null,
    amount_applied numeric(10,2) not null,
    application_unit_id uuid not null references public.units(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.applications for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.applications for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.applications
for each row
execute function simmer.soft_delete();

alter table public.applications enable row level security;

create policy "select: own groups"
on public.applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));