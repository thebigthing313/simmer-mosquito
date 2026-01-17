create table public.collections (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete set null,
    trap_id uuid not null references public.traps(id) on delete restrict,
    trap_lure_id uuid references public.trap_lures(id) on delete set null,
    collection_date date,
    collected_by uuid references public.profiles (id) on delete set null,
    trap_set_date date,
    trap_set_by uuid references public.profiles (id) on delete set null,
    trap_nights integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.collections for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.collections for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.collections
for each row
execute function simmer.soft_delete();

alter table public.collections enable row level security;

create policy "select: own groups or group_id is null"
on public.collections
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.collections
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.collections
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.collections
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));