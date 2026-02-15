create table public.spatial_features (
	id uuid primary key default gen_random_uuid() not null,
	geom extensions.geometry(geometry, 4326) not null,
	created_at timestamptz default now() not null,
	lat float8 generated always as (extensions.st_y(extensions.st_centroid(geom))) STORED null,
	lng float8 generated always as (extensions.st_x(extensions.st_centroid(geom))) STORED null,
	geojson jsonb generated always as (extensions.st_asgeojson(geom)::jsonb) STORED null
);

create index idx_spatial_features_gist_geom on public.spatial_features using gist (geom);
create unique index idx_spatial_features_unique_geom_hash on public.spatial_features using btree (md5(extensions.st_asbinary(geom)));

alter table public.spatial_features enable row level security;

create policy "select: all authenticated"
on public.spatial_features
for select
to authenticated
using (true);

create policy "insert: all authenticated"
on public.spatial_features
for insert
to authenticated
with check (true);

create policy "update: none"
on public.spatial_features
for update
to authenticated
using (false);

create policy "delete: none"
on public.spatial_features
for delete  
to authenticated
using (false);