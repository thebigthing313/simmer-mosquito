create table public.catch_basin_missions(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    basin_count integer not null,
    geojson jsonb,
    notes text,
    sample_dry integer,
    sample_wet integer,
    geom geometry(MultiPolygon, 4326) generated always as (
        extensions.ST_CollectionExtract(
            extensions.ST_Multi(
                extensions.ST_MakeValid(
                    extensions.ST_GeomFromGeoJSON(
                        case 
                            when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                            else geojson::text 
                        end
                    )
                )
            ), 3)
    ) stored,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint positive_basin_count check (basin_count > 0)
);

create index idx_catch_basin_missions_geom on public.catch_basin_missions using GIST (geom);

create trigger set_audit_fields
before insert or update on public.catch_basin_missions
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.catch_basin_missions
for each row
execute function simmer.soft_delete();

alter table public.catch_basin_missions enable row level security;

create policy "select: own groups or group_id is null"
on public.catch_basin_missions
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.catch_basin_missions
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.catch_basin_missions
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.catch_basin_missions
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));