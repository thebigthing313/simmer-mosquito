create table public.applications(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    insecticide_id uuid not null references public.insecticides(id) on delete restrict on update cascade,
    batch_id uuid references public.insecticide_batches(id) on delete set null on update cascade,
    application_date date not null,
    applicator_id uuid not null references public.profiles(user_id) on delete set null on update cascade,
    amount_applied double precision not null,
    application_unit_id uuid not null references public.units(id) on delete restrict,
    --- originating tables
    flight_aerial_site_id uuid references public.flight_aerial_sites(id) on delete restrict on update cascade,
    catch_basin_mission_id uuid references public.catch_basin_missions(id) on delete restrict on update cascade,
    truck_ulv_id uuid references public.areawide_adulticiding(id) on delete restrict on update cascade,
    hand_ulv_id uuid references public.hand_ulvs(id) on delete restrict on update cascade,
    point_larviciding_id uuid references public.point_larviciding(id) on delete restrict on update cascade,
    ----------------------
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint one_originating_table check (
        (flight_aerial_site_id is not null)::int +
        (catch_basin_mission_id is not null)::int +
        (truck_ulv_id is not null)::int +
        (hand_ulv_id is not null)::int +
        (point_larviciding_id is not null)::int
        = 1
    ),
    constraint amount_applied_positive check (amount_applied > 0)
);

create trigger set_audit_fields
before insert or update on public.applications
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.applications
for each row
execute function simmer.soft_delete();

alter table public.applications enable row level security;

create policy "select: own groups"
on public.applications
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.applications
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.applications
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.applications
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));