create table public.locations (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    location_name text not null,    
    lat double precision not null,
    lng double precision not null,
    address text not null,
    geom geometry(Point, 4326) generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create index idx_locations_geom on public.locations using GIST (geom);

create trigger handle_created_trigger before insert on public.locations for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.locations for each row
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.locations
for each row
execute function simmer.soft_delete();

alter table public.locations enable row level security;

create policy "select: group data"
on public.locations
for select
to authenticated
using (public.user_is_group_member (group_id));

create policy "insert: group collectors"
on public.locations
for insert
to authenticated
with check (public.user_has_group_role (group_id, 4));

create policy "update: own if collector, all if manager"
on public.locations
for update
to authenticated
using (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3))
with check (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3));

create policy "delete: own if collector, all if manager"
on public.locations
for delete
to authenticated
using (((public.user_has_group_role (group_id, 4)) and created_by=(select auth.uid())) or public.user_has_group_role (group_id, 3))

