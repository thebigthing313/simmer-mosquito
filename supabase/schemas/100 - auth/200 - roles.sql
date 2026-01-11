create table if not exists public.roles (
    "id" integer not null primary key,
    "role_name" text not null unique,
    "description" text
);

alter table public.roles enable row level security;

create policy "read: allow all"
on public.roles
for select
to public
using (true);

create policy "insert: none"
on public.roles
for insert
to public
with check (false);

create policy "update: none"
on public.roles
for update
to public
using (false)
with check (false);

create policy "delete: none"
on public.roles
for delete
to public
using (false);