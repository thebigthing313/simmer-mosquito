-- migrate:up
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

-- migrate:down
drop table if exists route_items;
drop table if exists routes;
drop type if exists route_type;
