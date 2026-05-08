-- migrate:up

-- Source: 202605060014_larval_surveillance.sql
create type larval_density as enum (
  'none',
  'light',
  'medium',
  'heavy',
  'very_heavy'
);

create table habitats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  habitat_type_id uuid references habitat_types(id) on delete set null,
  habitat_name text,
  description text not null,
  is_active boolean not null default true,
  is_inaccessible boolean not null default false,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index habitats_organization_active_name_idx
  on habitats (organization_id, is_active, habitat_name)
  where deleted_at is null;

create index habitats_organization_type_idx
  on habitats (organization_id, habitat_type_id)
  where deleted_at is null and habitat_type_id is not null;

create index habitats_organization_address_idx
  on habitats (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index habitats_feature_idx
  on habitats (feature_id)
  where deleted_at is null;

create table inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  habitat_id uuid references habitats(id) on delete set null,
  habitat_type_id uuid references habitat_types(id) on delete set null,
  address_id uuid references addresses(id) on delete restrict,
  inspected_by_profile_id uuid references profiles(id) on delete set null,
  inspection_date date not null,
  is_wet boolean not null default false,
  dip_count smallint,
  density larval_density,
  larvae_count integer,
  has_first_instar boolean not null default false,
  has_second_instar boolean not null default false,
  has_third_instar boolean not null default false,
  has_fourth_instar boolean not null default false,
  has_pupae boolean not null default false,
  has_eggs boolean not null default false,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index inspections_organization_date_idx
  on inspections (organization_id, inspection_date desc, created_at desc)
  where deleted_at is null;

create index inspections_organization_habitat_idx
  on inspections (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

create index inspections_organization_type_idx
  on inspections (organization_id, habitat_type_id)
  where deleted_at is null and habitat_type_id is not null;

create index inspections_organization_address_idx
  on inspections (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index inspections_feature_idx
  on inspections (feature_id)
  where deleted_at is null;

create table samples (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete restrict,
  display_name text,
  is_zero_larvae boolean not null default false,
  is_non_mosquito boolean not null default false,
  unidentifiable_reason text,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index samples_inspection_idx
  on samples (inspection_id)
  where deleted_at is null;

create table sample_species (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references samples(id) on delete restrict,
  species_id uuid not null references species(id) on delete restrict,
  identified_by_profile_id uuid references profiles(id) on delete set null,
  identified_at date not null,
  larvae_count integer not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint sample_species_larvae_count_positive
    check (larvae_count > 0),
  unique (sample_id, species_id)
);

create index sample_species_sample_idx
  on sample_species (sample_id)
  where deleted_at is null;

create index sample_species_species_idx
  on sample_species (species_id)
  where deleted_at is null;

create index sample_species_identified_by_idx
  on sample_species (identified_by_profile_id)
  where deleted_at is null and identified_by_profile_id is not null;

-- migrate:down

-- Source: 202605060014_larval_surveillance.sql
drop table if exists sample_species;
drop table if exists samples;
drop table if exists inspections;
drop table if exists habitats;
drop type if exists larval_density;

