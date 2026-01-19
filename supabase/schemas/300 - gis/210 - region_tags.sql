create table public.region_tags(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    region_id uuid not null references public.regions(id) on delete cascade,
    tag_id uuid not null references public.tags(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint region_tag_unique unique (region_id, tag_id)
);

create trigger handle_created_trigger before insert on public.region_tags for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.region_tags for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.region_tags
for each row
execute function simmer.soft_delete();

alter table public.region_tags enable row level security;

create policy "select: group data"
on public.region_tags
for select
to authenticated
using (public.user_is_group_member (group_id));

create policy "insert: group admin"
on public.region_tags
for insert
to authenticated
with check (public.user_has_group_role (group_id, 2));

create policy "update: group admin"
on public.region_tags
for update
to authenticated
using (public.user_has_group_role (group_id, 2))
with check (public.user_has_group_role (group_id, 2));

create policy "delete: group admin"
on public.region_tags
for delete
to authenticated
using (public.user_has_group_role (group_id, 2));