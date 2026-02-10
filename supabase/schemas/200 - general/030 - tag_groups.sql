create table public.tag_groups(
    id uuid primary key default gen_random_uuid(),
    tag_group_name text not null
);

alter table public.tag_groups enable row level security;

create policy "select: all"
on public.tag_groups
for select
to authenticated
using (true);

create policy "insert: none"
on public.tag_groups
for insert
to authenticated
with check (false);

create policy "update: none"
on public.tag_groups
for update
to authenticated
using (false)
with check (false);

create policy "delete: none"
on public.tag_groups
for delete
to authenticated
using (false);