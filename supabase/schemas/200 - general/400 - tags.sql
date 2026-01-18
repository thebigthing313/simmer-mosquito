create domain html_color as text
check (value ~* '^#[a-f0-9]{6}$');

create table public.tags (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete set null,
    name text not null,
    description text,
    color html_color,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint name_unique unique (group_id, name)
);

create trigger handle_created_trigger before insert on public.tags for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.tags for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.tags
for each row
execute function simmer.soft_delete();

alter table public.tags enable row level security;

create policy "select: own groups"
on public.tags
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.tags
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.tags
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.tags
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));