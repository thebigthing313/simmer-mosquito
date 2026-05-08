-- migrate:up

-- Source: 202605060015_chemical_control.sql
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

-- Source: 202605060016_simplify_chemical_control.sql
drop index if exists insecticide_batches_organization_insecticide_idx;
drop index if exists application_batches_application_idx;
drop index if exists application_batches_insecticide_batch_idx;

alter table application_methods
  drop column if exists description;

alter table insecticide_batches
  drop column if exists organization_id;

alter table application_batches
  add column if not exists created_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists updated_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references profiles(id) on delete set null;

create index insecticide_batches_insecticide_idx
  on insecticide_batches (insecticide_id, is_active, batch_name)
  where deleted_at is null;

create index application_batches_application_idx
  on application_batches (application_id)
  where deleted_at is null;

create index application_batches_insecticide_batch_idx
  on application_batches (insecticide_batch_id)
  where deleted_at is null;

-- Source: 202605060017_other_interventions.sql
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

-- Source: 202605060023_requested_control_actions.sql
create type control_type as enum (
  'application',
  'source_reduction',
  'biocontrol',
  'outreach'
);

create table requested_control_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  control_type control_type not null,
  recommended_method_id uuid,
  summary text,
  inspection_id uuid references inspections(id) on delete set null,
  collection_id uuid references collections(id) on delete set null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  requested_by_profile_id uuid references profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_profile_id uuid references profiles(id) on delete set null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index requested_control_actions_organization_requested_idx
  on requested_control_actions (organization_id, requested_at desc)
  where deleted_at is null;

create index requested_control_actions_organization_type_requested_idx
  on requested_control_actions (organization_id, control_type, requested_at desc)
  where deleted_at is null;

create index requested_control_actions_organization_resolved_idx
  on requested_control_actions (organization_id, resolved_at)
  where deleted_at is null;

create index requested_control_actions_organization_inspection_idx
  on requested_control_actions (organization_id, inspection_id)
  where deleted_at is null and inspection_id is not null;

create index requested_control_actions_organization_collection_idx
  on requested_control_actions (organization_id, collection_id)
  where deleted_at is null and collection_id is not null;

create index requested_control_actions_feature_idx
  on requested_control_actions (feature_id)
  where deleted_at is null;

alter table applications
  add column requested_control_action_id uuid references requested_control_actions(id) on delete set null;

create index applications_requested_control_action_idx
  on applications (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

alter table source_reductions
  add column requested_control_action_id uuid references requested_control_actions(id) on delete set null;

create index source_reductions_requested_control_action_idx
  on source_reductions (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

alter table biocontrol_actions
  add column requested_control_action_id uuid references requested_control_actions(id) on delete set null;

create index biocontrol_actions_requested_control_action_idx
  on biocontrol_actions (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

alter table outreach_actions
  add column requested_control_action_id uuid references requested_control_actions(id) on delete set null;

create index outreach_actions_requested_control_action_idx
  on outreach_actions (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

-- Source: 202605060024_missions.sql
create table missions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  mission_name text,
  control_type control_type not null,
  planned_method_id uuid,
  assigned_to_profile_id uuid references profiles(id) on delete set null,
  assigned_by_profile_id uuid references profiles(id) on delete set null,
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz,
  rain_date date,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index missions_organization_scheduled_start_idx
  on missions (organization_id, scheduled_start_at desc)
  where deleted_at is null;

create index missions_organization_type_scheduled_start_idx
  on missions (organization_id, control_type, scheduled_start_at desc)
  where deleted_at is null;

create index missions_assigned_to_idx
  on missions (organization_id, assigned_to_profile_id, scheduled_start_at desc)
  where deleted_at is null and assigned_to_profile_id is not null;

create index missions_started_idx
  on missions (organization_id, started_at)
  where deleted_at is null and started_at is not null;

create index missions_completed_idx
  on missions (organization_id, completed_at)
  where deleted_at is null and completed_at is not null;

create index missions_cancelled_idx
  on missions (organization_id, cancelled_at)
  where deleted_at is null and cancelled_at is not null;

create table mission_items (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  requested_control_action_id uuid references requested_control_actions(id) on delete set null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  position double precision not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index mission_items_mission_position_idx
  on mission_items (mission_id, position)
  where deleted_at is null;

create index mission_items_mission_requested_control_action_idx
  on mission_items (mission_id, requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

create index mission_items_requested_control_action_idx
  on mission_items (requested_control_action_id)
  where deleted_at is null and requested_control_action_id is not null;

create index mission_items_feature_idx
  on mission_items (feature_id)
  where deleted_at is null;

-- migrate:down

-- Source: 202605060024_missions.sql
drop table if exists mission_items;
drop table if exists missions;

-- Source: 202605060023_requested_control_actions.sql
drop index if exists outreach_actions_requested_control_action_idx;
alter table outreach_actions
  drop column if exists requested_control_action_id;

drop index if exists biocontrol_actions_requested_control_action_idx;
alter table biocontrol_actions
  drop column if exists requested_control_action_id;

drop index if exists source_reductions_requested_control_action_idx;
alter table source_reductions
  drop column if exists requested_control_action_id;

drop index if exists applications_requested_control_action_idx;
alter table applications
  drop column if exists requested_control_action_id;

drop table if exists requested_control_actions;
drop type if exists control_type;

-- Source: 202605060017_other_interventions.sql
drop table if exists biocontrol_actions;
drop table if exists outreach_actions;
drop table if exists source_reductions;
drop table if exists biocontrol_methods;
drop table if exists outreach_methods;
drop table if exists source_reduction_methods;

-- Source: 202605060016_simplify_chemical_control.sql
drop index if exists application_batches_insecticide_batch_idx;
drop index if exists application_batches_application_idx;
drop index if exists insecticide_batches_insecticide_idx;

alter table application_batches
  drop column if exists deleted_by_profile_id,
  drop column if exists deleted_at,
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table insecticide_batches
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

alter table application_methods
  add column if not exists description text;

-- Source: 202605060015_chemical_control.sql
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

