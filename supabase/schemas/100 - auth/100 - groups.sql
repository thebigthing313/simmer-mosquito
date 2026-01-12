create table public.groups (
    "id" uuid not null default gen_random_uuid() primary key,
    "group_name" text not null,
    "address" text not null,
    "phone" text not null,
    "short_name" text,
    "fax" text,
    "website_url" text,
    "logo_url" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid references auth.users (id) on delete restrict,
    "updated_at" timestamp with time zone,
    "updated_by" uuid references auth.users (id) on delete restrict
);

create trigger handle_updated_trigger before
update on public.groups for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger created_by_trigger before insert on public.groups for each row
execute function simmer.set_created_by ();

create trigger soft_delete_trigger
before delete on public.groups
for each row
execute function simmer.soft_delete();

alter table public.groups enable row level security;

create policy "read: group members"
on public.groups
for select
to authenticated
using (public.user_is_group_member(id));

create policy "insert: none"
on public.groups
for insert
to public
with check (false);

create policy "update: group owners"
on public.groups
for update
to authenticated
using (public.user_has_group_role(id, 1))
with check (public.user_has_group_role(id, 1));

create policy "delete: none"
on public.groups
for delete
to public
using (false);
