-- migrate:up

-- Source: 202605060020_polymorphic_operational_tables.sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  comment_text text not null,
  commented_by_profile_id uuid references profiles(id) on delete set null,
  commented_at timestamptz not null default now(),
  is_pinned boolean not null default false,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index comments_entity_idx
  on comments (organization_id, entity_type, entity_id, commented_at desc)
  where deleted_at is null;

create index comments_pinned_idx
  on comments (organization_id, is_pinned, commented_at desc)
  where deleted_at is null and is_pinned = true;

create table tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  tag_name text not null,
  description text,
  color text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index tags_organization_name_unique
  on tags (organization_id, tag_name)
  where deleted_at is null;

create index tags_organization_active_name_idx
  on tags (organization_id, is_active, tag_name)
  where deleted_at is null;

create table tag_items (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references tags(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index tag_items_tag_entity_unique
  on tag_items (tag_id, entity_type, entity_id)
  where deleted_at is null;

create index tag_items_entity_idx
  on tag_items (entity_type, entity_id)
  where deleted_at is null;

create index tag_items_tag_idx
  on tag_items (tag_id)
  where deleted_at is null;

create table additional_personnel (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  personnel_profile_id uuid not null references profiles(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index additional_personnel_entity_personnel_unique
  on additional_personnel (organization_id, personnel_profile_id, entity_type, entity_id)
  where deleted_at is null;

create index additional_personnel_entity_idx
  on additional_personnel (organization_id, entity_type, entity_id)
  where deleted_at is null;

create index additional_personnel_personnel_idx
  on additional_personnel (organization_id, personnel_profile_id)
  where deleted_at is null;

-- Source: 202605060021_routes.sql
create type route_type as enum (
  'habitat',
  'trap'
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  route_name text not null,
  route_type route_type not null default 'habitat',
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index routes_organization_name_unique
  on routes (organization_id, route_name)
  where deleted_at is null;

create index routes_organization_type_name_idx
  on routes (organization_id, route_type, route_name)
  where deleted_at is null;

create table route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
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

create unique index route_items_route_entity_unique
  on route_items (route_id, entity_type, entity_id)
  where deleted_at is null;

create index route_items_route_position_idx
  on route_items (route_id, position)
  where deleted_at is null;

create index route_items_entity_idx
  on route_items (entity_type, entity_id)
  where deleted_at is null;

-- Source: 202605060022_assignments.sql
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

-- Source: 202605060022_assignments.sql
drop table if exists assignment_items;
drop table if exists assignments;

-- Source: 202605060021_routes.sql
drop table if exists route_items;
drop table if exists routes;
drop type if exists route_type;

-- Source: 202605060020_polymorphic_operational_tables.sql
drop table if exists additional_personnel;
drop table if exists tag_items;
drop table if exists tags;
drop table if exists comments;

