create table public.groups (
    "id" uuid not null default gen_random_uuid() primary key,
    "group_name" text not null,
    "address" text not null,
    "phone" text not null,
    "short_name" text not null unique,
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