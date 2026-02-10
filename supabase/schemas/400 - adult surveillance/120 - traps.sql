create table public.traps (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    address_id uuid references public.addresses(id) on delete set null on update cascade,
    trap_type_id uuid not null references public.trap_types(id) on delete restrict on update cascade,
    lat double precision not null,
    lng double precision not null,
    is_active boolean not null default true,
    is_permanent boolean not null default false,
    geom geometry(Point, 4326) generated always as (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)) stored,
    trap_name text,
    trap_code text,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);

create index idx_traps_geom on public.traps using GIST (geom);

create trigger set_audit_fields
before insert or update on public.traps
for each row
execute function public.set_audit_fields();

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