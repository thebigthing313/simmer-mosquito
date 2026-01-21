create table public.additional_personnel(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    profile_id uuid not null references public.profiles(id) on delete restrict,
    --- originating tables
    inspection_id uuid references public.inspections(id) on delete set null,
    mission_applications_id uuid references public.mission_applications(id) on delete set null,
    ----------------------
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.additional_personnel for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.additional_personnel for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

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