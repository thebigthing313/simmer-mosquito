-- migrate:up
create table collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  trap_id uuid references traps(id) on delete set null,
  collection_method_id uuid not null references collection_methods(id) on delete restrict,
  collection_lure_id uuid references collection_lures(id) on delete set null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  collected_at timestamptz,
  collected_by_profile_id uuid references profiles(id) on delete set null,
  started_at timestamptz,
  set_by_profile_id uuid references profiles(id) on delete set null,
  has_problem boolean not null default false,
  is_zero_result boolean not null default false,
  is_non_mosquito boolean not null default false,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index collections_organization_collected_at_idx
  on collections (organization_id, collected_at desc nulls last, created_at desc)
  where deleted_at is null;

create index collections_organization_trap_idx
  on collections (organization_id, trap_id)
  where deleted_at is null and trap_id is not null;

create index collections_organization_method_idx
  on collections (organization_id, collection_method_id)
  where deleted_at is null;

create index collections_organization_address_idx
  on collections (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index collections_feature_idx
  on collections (feature_id)
  where deleted_at is null;

-- migrate:down
drop table if exists collections;
