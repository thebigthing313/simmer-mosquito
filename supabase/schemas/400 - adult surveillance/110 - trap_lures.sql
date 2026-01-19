create table public.trap_lures (
    id uuid primary key default gen_random_uuid(),
    group_id uuid references public.groups(id) on delete set null,
    lure_name text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.trap_lures for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.trap_lures for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.trap_lures
for each row
execute function simmer.soft_delete();

alter table public.trap_lures enable row level security;

create policy "select: own groups or group_id is null"
on public.trap_lures
for select
to authenticated
using (group_id is null or public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.trap_lures
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.trap_lures
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.trap_lures
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));