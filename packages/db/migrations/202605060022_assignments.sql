-- migrate:up
create table assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  assignment_name text,
  assigned_to_profile_id uuid references profiles(id) on delete set null,
  assigned_by_profile_id uuid references profiles(id) on delete set null,
  assignment_date date not null,
  due_at timestamptz,
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

create index assignments_organization_date_idx
  on assignments (organization_id, assignment_date desc, created_at desc)
  where deleted_at is null;

create index assignments_assigned_to_idx
  on assignments (organization_id, assigned_to_profile_id, assignment_date desc)
  where deleted_at is null and assigned_to_profile_id is not null;

create index assignments_started_idx
  on assignments (organization_id, started_at)
  where deleted_at is null and started_at is not null;

create index assignments_completed_idx
  on assignments (organization_id, completed_at)
  where deleted_at is null and completed_at is not null;

create index assignments_cancelled_idx
  on assignments (organization_id, cancelled_at)
  where deleted_at is null and cancelled_at is not null;

create table assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  position double precision not null,
  directions_to_next_item text,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index assignment_items_assignment_position_idx
  on assignment_items (assignment_id, position)
  where deleted_at is null;

create unique index assignment_items_assignment_entity_unique
  on assignment_items (assignment_id, entity_type, entity_id)
  where deleted_at is null;

create index assignment_items_entity_idx
  on assignment_items (entity_type, entity_id)
  where deleted_at is null;

-- migrate:down
drop table if exists assignment_items;
drop table if exists assignments;
