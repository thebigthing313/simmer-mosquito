create table public.mission_applications(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    adulticide_mission_id uuid not null references public.adulticide_missions(id) on delete restrict,
    applicator_id uuid not null references public.profiles(id) on delete restrict,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    geom geometry(MultiPolygon, 4326) not null,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create index idx_mission_applications_geom on public.mission_applications using gist (geom);

create trigger handle_created_trigger before insert on public.mission_applications for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.mission_applications for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.mission_applications
for each row
execute function simmer.soft_delete();

alter table public.mission_applications enable row level security;

create policy "select: own groups"
on public.mission_applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.mission_applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.mission_applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.mission_applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));