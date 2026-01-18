create table public.tag_groups(
    id uuid primary key default gen_random_uuid(),
    group_id uuid references public.groups(id) on delete restrict,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.tag_groups for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.tag_groups for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.tag_groups
for each row
execute function simmer.soft_delete();

alter table public.tag_groups enable row level security;

create policy "select: own groups or group_id is null"
on public.tag_groups
for select
to authenticated
using (public.user_is_group_member(group_id) or group_id is null);

create policy "insert: own group admin"
on public.tag_groups
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: own group admin"
on public.tag_groups
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: own group admin"
on public.tag_groups
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));