create table public.region_subdivisions (
    id uuid primary key default gen_random_uuid(),
    region_id uuid not null references public.regions(id) on delete cascade,
    geom geometry(Polygon, 4326) not null
);

create index idx_region_subdivisions_geom
on public.region_subdivisions using GIST (geom);

create or replace function simmer.refresh_region_subdivisions()
returns trigger
language plpgsql
set search_path = ''
security definer
as $$
    begin
        -- 1. If this is an update, delete existing first
        if (TG_OP = 'UPDATE') then
            delete from public.region_subdivisions
            where region_id = OLD.id;
        end if;

        -- 2. check against null geometry
        if (NEW.geom is null) then
            return NEW;
        end if;

        -- 3. Insert new subdivisions. Adjust vertices if not performant enough.
        insert into public.region_subdivisions (region_id, geom)
        select NEW.id,
        (extensions.ST_Subdivide(extensions.ST_MakeValid(NEW.geom), 128))::geometry(Polygon, 4326);

        return NEW;
    end;
$$;

create trigger refresh_region_subdivisions_trigger
after insert or update of geom on public.regions
for each row
execute function simmer.refresh_region_subdivisions();