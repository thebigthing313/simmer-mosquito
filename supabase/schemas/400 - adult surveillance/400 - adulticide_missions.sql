create type public.adulticide_mission_status_enum as enum ('planned', 'completed', 'canceled');
create type public.adulticide_mission_method_enum as enum ('ground', 'aerial');

create table public.adulticide_missions(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    mission_date date not null,
    adulticide_id uuid not null references public.insecticides(id) on delete restrict,
    rain_date date,
    completed_date date,
    method public.adulticide_mission_method_enum not null,
    description text not null,
    status public.adulticide_mission_status_enum not null default 'planned',
    geom geometry(MultiPolygon, 4326) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create index idx_adulticide_missions_geom
on public.adulticide_missions
using gist (geom);

create trigger handle_created_trigger before insert on public.adulticide_missions for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.adulticide_missions for each row
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.adulticide_missions
for each row
execute function simmer.soft_delete();

alter table public.adulticide_missions enable row level security;
create policy "select: own groups or group_id is null"
on public.adulticide_missions
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.adulticide_missions
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));
create policy "update: own group manager"
on public.adulticide_missions
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.adulticide_missions
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));