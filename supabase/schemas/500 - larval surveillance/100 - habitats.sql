create table public.habitats (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete set null,
    lat double precision not null,
    lng double precision not null,
    description text not null,
    is_active boolean not null default true,
    is_permanent boolean not null default false,
    is_inaccessible boolean not null default false,
    name text,
    location_id uuid references public.locations(id) on delete set null,
    geom geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create index idx_habitats_geom on public.habitats using GIST (geom);

create trigger handle_created_trigger before insert on public.habitats for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.habitats for each row
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.habitats
for each row
execute function simmer.soft_delete();

alter table public.habitats enable row level security;

create policy "select: own groups"
on public.habitats
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.habitats
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.habitats
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups manager"
on public.habitats
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));