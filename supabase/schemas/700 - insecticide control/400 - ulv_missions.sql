create table public.ulv_missions(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    mission_date date not null,
    rain_date date,
    start_time time,
    end_time time,
    is_cancelled boolean not null default false,
    area_description text,
    completion_date date,
    geojson jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    geom geometry(MultiPolygon, 4326) generated always as (
        extensions.ST_CollectionExtract(
            extensions.ST_Multi(
                extensions.ST_MakeValid(
                    extensions.ST_Force2D(
                        extensions.ST_GeomFromGeoJSON(
                            case 
                                when (geojson->'geometry') is not null then (geojson->'geometry')::text 
                                else geojson::text 
                            end
                        )
                    )
                )
            ), 3)
    ) stored,
    constraint valid_time_range check (
        (start_time is null or end_time is null) or (end_time > start_time)
    ),
    constraint rain_date_after_mission_date check (
        rain_date is null or rain_date > mission_date
    ),
    constraint completion_date_after_mission_date check (
        completion_date is null or completion_date >= mission_date
    )
);

create index idx_ulv_missions_geom on public.ulv_missions using GIST (geom);

create trigger set_audit_fields
before insert or update on public.ulv_missions
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.ulv_missions
for each row
execute function simmer.soft_delete();

alter table public.ulv_missions enable row level security;

create policy "select: own groups or group_id is null"
on public.ulv_missions
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.ulv_missions
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.ulv_missions
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.ulv_missions
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));