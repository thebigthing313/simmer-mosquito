create table public.habitat_tags (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete set null,
    habitat_id uuid not null references public.habitats(id) on delete set null,
    tag_id uuid not null references public.tags(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.habitat_tags for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.habitat_tags for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.habitat_tags
for each row
execute function simmer.soft_delete();

alter table public.habitat_tags enable row level security;

create policy "select: own groups"
on public.habitat_tags
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.habitat_tags
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.habitat_tags
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups collector"
on public.habitat_tags
for delete
to authenticated
using (public.user_has_group_role(group_id, 4));