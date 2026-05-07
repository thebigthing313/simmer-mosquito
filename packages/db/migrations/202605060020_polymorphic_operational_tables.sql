-- migrate:up
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

-- migrate:down
drop table if exists additional_personnel;
drop table if exists tag_items;
drop table if exists tags;
drop table if exists comments;
