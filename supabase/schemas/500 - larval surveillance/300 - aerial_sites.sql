create table public.aerial_sites(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    aerial_site_name text not null,
    aerial_site_code text,
    is_active boolean not null default true,
    geojson jsonb not null,
    metadata jsonb,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
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
    constraint unique_aerial_site_name_per_group unique (group_id, aerial_site_name)
);

create index idx_aerial_sites_geom on public.aerial_sites using gist (geom);

create trigger set_audit_fields
before insert or update on public.aerial_sites
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.aerial_sites 
for each row
execute function simmer.soft_delete();

alter table public.aerial_sites enable row level security;

create policy "select: own groups"
on public.aerial_sites
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group admin"
on public.aerial_sites
for insert
to authenticated
with check (public.user_has_group_role(group_id, 2));

create policy "update: group admin"
on public.aerial_sites
for update
to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));

create policy "delete: group admin"
on public.aerial_sites
for delete
to authenticated
using (public.user_has_group_role(group_id, 2));