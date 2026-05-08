-- migrate:up
create table spatial_feature_regions (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references spatial_features(id) on delete cascade,
  region_folder_id uuid not null references region_folders(id) on delete cascade,
  intersected_region_ids uuid[] not null,
  cached_at timestamptz not null default now()
);

create unique index spatial_feature_regions_feature_folder_unique
  on spatial_feature_regions (feature_id, region_folder_id);

create index spatial_feature_regions_region_folder_idx
  on spatial_feature_regions (region_folder_id);

-- migrate:down
drop table if exists spatial_feature_regions;
