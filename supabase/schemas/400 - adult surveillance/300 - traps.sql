create table public.traps (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    trap_type_id uuid not null references public.trap_types(id) on delete restrict,
    lat double precision not null,
    lng double precision not null,
    is_active boolean not null default true,
    is_permanent boolean not null default false,
    geom geometry(Point, 4326) generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)) stored,
    location_id uuid references public.locations(id) on delete set null,
    trap_name text,
    trap_code text,
    metadata jsonb,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid references auth.users (id) on delete restrict,
    "updated_at" timestamp with time zone,
    "updated_by" uuid references auth.users (id) on delete restrict
);

create index idx_traps_geom on public.traps using GIST (geom);

create trigger handle_created_trigger before insert on public.traps for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.traps for each row
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.traps
for each row
execute function simmer.soft_delete();

alter table public.traps enable row level security;
create policy "select: own groups or group_id is null"
on public.traps
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.traps
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.traps
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.traps
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));