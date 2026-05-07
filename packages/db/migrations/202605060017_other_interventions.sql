-- migrate:up
create table source_reduction_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  custom_schema jsonb,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index source_reduction_methods_org_name_unique
  on source_reduction_methods (organization_id, name)
  where deleted_at is null;

create index source_reduction_methods_org_active_name_idx
  on source_reduction_methods (organization_id, is_active, name)
  where deleted_at is null;

create table outreach_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  custom_schema jsonb,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index outreach_methods_org_name_unique
  on outreach_methods (organization_id, name)
  where deleted_at is null;

create index outreach_methods_org_active_name_idx
  on outreach_methods (organization_id, is_active, name)
  where deleted_at is null;

create table biocontrol_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  custom_schema jsonb,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index biocontrol_methods_org_name_unique
  on biocontrol_methods (organization_id, name)
  where deleted_at is null;

create index biocontrol_methods_org_active_name_idx
  on biocontrol_methods (organization_id, is_active, name)
  where deleted_at is null;

create table source_reductions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  source_reduction_method_id uuid not null references source_reduction_methods(id) on delete restrict,
  technician_profile_id uuid references profiles(id) on delete set null,
  source_reduction_date date not null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  sources_eliminated_amount double precision not null,
  sources_eliminated_unit_id uuid not null references units(id) on delete restrict,
  inspection_id uuid references inspections(id) on delete set null,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint source_reductions_sources_eliminated_amount_positive
    check (sources_eliminated_amount > 0)
);

create index source_reductions_organization_date_idx
  on source_reductions (organization_id, source_reduction_date desc, created_at desc)
  where deleted_at is null;

create index source_reductions_organization_method_idx
  on source_reductions (organization_id, source_reduction_method_id)
  where deleted_at is null;

create index source_reductions_organization_inspection_idx
  on source_reductions (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;

create index source_reductions_feature_idx
  on source_reductions (feature_id)
  where deleted_at is null;

create table outreach_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  outreach_method_id uuid not null references outreach_methods(id) on delete restrict,
  technician_profile_id uuid references profiles(id) on delete set null,
  outreach_date date not null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  inspection_id uuid references inspections(id) on delete set null,
  reach integer not null,
  reach_description text,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint outreach_actions_reach_positive
    check (reach > 0)
);

create index outreach_actions_organization_date_idx
  on outreach_actions (organization_id, outreach_date desc, created_at desc)
  where deleted_at is null;

create index outreach_actions_organization_method_idx
  on outreach_actions (organization_id, outreach_method_id)
  where deleted_at is null;

create index outreach_actions_organization_inspection_idx
  on outreach_actions (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;

create index outreach_actions_feature_idx
  on outreach_actions (feature_id)
  where deleted_at is null;

create table biocontrol_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  biocontrol_method_id uuid not null references biocontrol_methods(id) on delete restrict,
  technician_profile_id uuid references profiles(id) on delete set null,
  biocontrol_date date not null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  habitat_id uuid references habitats(id) on delete set null,
  inspection_id uuid references inspections(id) on delete set null,
  amount_released double precision not null,
  release_unit_id uuid not null references units(id) on delete restrict,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint biocontrol_actions_amount_released_positive
    check (amount_released > 0)
);

create index biocontrol_actions_organization_date_idx
  on biocontrol_actions (organization_id, biocontrol_date desc, created_at desc)
  where deleted_at is null;

create index biocontrol_actions_organization_method_idx
  on biocontrol_actions (organization_id, biocontrol_method_id)
  where deleted_at is null;

create index biocontrol_actions_organization_habitat_idx
  on biocontrol_actions (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

create index biocontrol_actions_organization_inspection_idx
  on biocontrol_actions (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;

create index biocontrol_actions_feature_idx
  on biocontrol_actions (feature_id)
  where deleted_at is null;

-- migrate:down
drop table if exists biocontrol_actions;
drop table if exists outreach_actions;
drop table if exists source_reductions;
drop table if exists biocontrol_methods;
drop table if exists outreach_methods;
drop table if exists source_reduction_methods;
