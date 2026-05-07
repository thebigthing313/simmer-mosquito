-- migrate:up
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
drop table if exists mission_items;
drop table if exists missions;
