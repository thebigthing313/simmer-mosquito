-- migrate:up
create table traps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  collection_method_id uuid not null references collection_methods(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  collection_lure_id uuid references collection_lures(id) on delete set null,
  trap_name text,
  trap_code text,
  description text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index traps_organization_active_name_idx
  on traps (organization_id, is_active, trap_name)
  where deleted_at is null;

create index traps_organization_code_idx
  on traps (organization_id, trap_code)
  where deleted_at is null and trap_code is not null;

create index traps_organization_method_idx
  on traps (organization_id, collection_method_id)
  where deleted_at is null;

create index traps_organization_address_idx
  on traps (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index traps_feature_idx
  on traps (feature_id)
  where deleted_at is null;

-- migrate:down
drop table if exists traps;
