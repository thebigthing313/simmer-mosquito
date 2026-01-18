create table public.contacts (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    first_name text,
    last_name text,
    organization text,
    title text,
    primary_phone text,
    secondary_phone text,
    fax_number text,
    email text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null
);

create trigger handle_created_trigger before insert on public.contacts for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.contacts for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.contacts
for each row
execute function simmer.soft_delete();

alter table public.contacts enable row level security;

create policy "select: own groups"
on public.contacts
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.contacts
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.contacts
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.contacts
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));