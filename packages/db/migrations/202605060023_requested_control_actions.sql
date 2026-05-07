-- migrate:up
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

-- migrate:down
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
