-- migrate:up
create type unit_type as enum (
  'weight',
  'distance',
  'area',
  'volume',
  'temperature',
  'duration',
  'count',
  'speed'
);

create type unit_system as enum (
  'si',
  'imperial',
  'us_customary'
);

create type insecticide_type as enum (
  'larvicide',
  'adulticide',
  'pupicide',
  'other'
);

create table units (
  id uuid primary key default gen_random_uuid(),
  unit_name text not null unique,
  abbreviation text not null unique,
  unit_type unit_type not null,
  unit_system unit_system not null,
  created_at timestamptz not null default now()
);

create table application_methods (
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

create unique index application_methods_org_name_unique
  on application_methods (organization_id, name)
  where deleted_at is null;

create index application_methods_org_active_name_idx
  on application_methods (organization_id, is_active, name)
  where deleted_at is null;

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  vehicle_name text not null,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index vehicles_organization_name_idx
  on vehicles (organization_id, vehicle_name)
  where deleted_at is null;

create table equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  equipment_name text not null,
  serial_number text,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index equipment_organization_name_idx
  on equipment (organization_id, equipment_name)
  where deleted_at is null;

create table insecticides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  trade_name text not null,
  active_ingredient text not null,
  is_active boolean not null default true,
  type insecticide_type not null,
  registration_number text not null,
  default_unit_id uuid not null references units(id) on delete restrict,
  inventory_unit_id uuid references units(id) on delete restrict,
  conversion_factor double precision,
  label_url text,
  msds_url text,
  shorthand text,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index insecticides_organization_active_trade_name_idx
  on insecticides (organization_id, is_active, trade_name)
  where deleted_at is null;

create index insecticides_organization_type_idx
  on insecticides (organization_id, type)
  where deleted_at is null;

create table insecticide_batches (
  id uuid primary key default gen_random_uuid(),
  insecticide_id uuid not null references insecticides(id) on delete restrict,
  batch_name text not null,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index insecticide_batches_organization_insecticide_idx
  on insecticide_batches (insecticide_id, is_active, batch_name)
  where deleted_at is null;

create table formulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  formulation_name text not null,
  description text,
  is_active boolean not null default true,
  diluent_ratio double precision not null default 0,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index formulations_organization_active_name_idx
  on formulations (organization_id, is_active, formulation_name)
  where deleted_at is null;

create table formulation_insecticides (
  id uuid primary key default gen_random_uuid(),
  formulation_id uuid not null references formulations(id) on delete cascade,
  insecticide_id uuid not null references insecticides(id) on delete restrict,
  ratio double precision not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index formulation_insecticides_formulation_idx
  on formulation_insecticides (formulation_id)
  where deleted_at is null;

create index formulation_insecticides_insecticide_idx
  on formulation_insecticides (insecticide_id)
  where deleted_at is null;

create table applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  application_method_id uuid references application_methods(id) on delete set null,
  insecticide_id uuid not null references insecticides(id) on delete restrict,
  applicator_profile_id uuid references profiles(id) on delete set null,
  application_date date not null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  vehicle_id uuid references vehicles(id) on delete set null,
  equipment_id uuid references equipment(id) on delete set null,
  amount_applied double precision not null,
  application_unit_id uuid not null references units(id) on delete restrict,
  habitat_id uuid references habitats(id) on delete set null,
  collection_id uuid references collections(id) on delete set null,
  inspection_id uuid references inspections(id) on delete set null,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint applications_amount_applied_positive
    check (amount_applied > 0)
);

create index applications_organization_date_idx
  on applications (organization_id, application_date desc, created_at desc)
  where deleted_at is null;

create index applications_organization_method_idx
  on applications (organization_id, application_method_id)
  where deleted_at is null and application_method_id is not null;

create index applications_organization_insecticide_idx
  on applications (organization_id, insecticide_id)
  where deleted_at is null;

create index applications_organization_habitat_idx
  on applications (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

create index applications_organization_collection_idx
  on applications (organization_id, collection_id)
  where deleted_at is null and collection_id is not null;

create index applications_organization_inspection_idx
  on applications (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;

create index applications_feature_idx
  on applications (feature_id)
  where deleted_at is null;

create table application_batches (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  insecticide_batch_id uuid not null references insecticide_batches(id) on delete cascade,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index application_batches_application_idx
  on application_batches (application_id)
  where deleted_at is null;

create index application_batches_insecticide_batch_idx
  on application_batches (insecticide_batch_id)
  where deleted_at is null;

-- migrate:down
drop table if exists application_batches;
drop table if exists applications;
drop table if exists formulation_insecticides;
drop table if exists formulations;
drop table if exists insecticide_batches;
drop table if exists insecticides;
drop table if exists equipment;
drop table if exists vehicles;
drop table if exists application_methods;
drop table if exists units;
drop type if exists insecticide_type;
drop type if exists unit_system;
drop type if exists unit_type;
