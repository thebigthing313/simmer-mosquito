create table public.mission_subdivisions (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    mission_id uuid not null references public.adulticide_missions(id) on delete cascade,
    geom geometry(Polygon, 4326) not null
);

create index idx_mission_subdivisions_geom
on public.mission_subdivisions using GIST (geom);

create or replace function simmer.refresh_mission_subdivisions()
returns trigger
language plpgsql
set search_path = ''
security definer
as $$
    begin
        -- 1. If this is an update, delete existing first
        if (TG_OP = 'UPDATE') then
            delete from public.mission_subdivisions
            where mission_id = OLD.id;
        end if;

        -- 2. check against null geometry
        if (NEW.geom is null) then
            return NEW;
        end if;

        -- 3. Insert new subdivisions. Adjust vertices if not performant enough.
        insert into public.mission_subdivisions (mission_id, geom)
        select NEW.id,
        (extensions.ST_Subdivide(extensions.ST_MakeValid(NEW.geom), 128))::geometry(Polygon, 4326);

        return NEW;
    end;
$$;

create trigger refresh_mission_subdivisions_trigger
after insert or update of geom on public.adulticide_missions
for each row
execute function simmer.refresh_mission_subdivisions();

alter table public.mission_subdivisions enable row level security;

create policy "select: own groups"
on public.mission_subdivisions
for select
to authenticated
using (public.user_is_group_member (group_id));

create policy "insert: own group manager"
on public.mission_subdivisions
for insert
to authenticated
with check (public.user_has_group_role (group_id, 3));

create policy "update: own group manager"
on public.mission_subdivisions
for update
to authenticated
using (public.user_has_group_role (group_id, 3))
with check (public.user_has_group_role (group_id, 3));

create policy "delete: own group manager"
on public.mission_subdivisions
for delete
to authenticated
using (public.user_has_group_role (group_id, 3));