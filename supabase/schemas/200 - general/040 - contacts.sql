create table public.contacts (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    contact_name text,
    preferred_phone text,
    alternate_phone text,
    fax text,
    email text,
    organization text,
    department text,
    title text,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint at_least_one_contact check (
        num_nonnulls(
            nullif(preferred_phone, ''), 
            nullif(email, ''), 
            nullif(fax, '')
        ) > 0
    )
);

create trigger set_audit_fields
before insert or update on public.contacts
for each row
execute function public.set_audit_fields();

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