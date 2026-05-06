-- migrate:up
create table genera (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique,
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table species (
  id uuid primary key default gen_random_uuid(),
  genus_id uuid references genera(id) on delete restrict,
  epithet text not null,
  common_name text,
  display_name text not null,
  is_special boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (genus_id, epithet)
);

create unique index species_special_epithet_unique
  on species (epithet)
  where genus_id is null;

create table organization_species (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  species_id uuid not null references species(id) on delete restrict,
  display_name_override text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, species_id)
);

create index organization_species_org_active_sort_idx
  on organization_species (organization_id, is_active, sort_order);

create table collection_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index collection_methods_org_name_unique
  on collection_methods (organization_id, name)
  where deleted_at is null;

create index collection_methods_org_active_sort_idx
  on collection_methods (organization_id, is_active, sort_order)
  where deleted_at is null;

create table collection_lures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index collection_lures_org_name_unique
  on collection_lures (organization_id, name)
  where deleted_at is null;

create index collection_lures_org_active_sort_idx
  on collection_lures (organization_id, is_active, sort_order)
  where deleted_at is null;

create table habitat_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  custom_schema jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index habitat_types_org_name_unique
  on habitat_types (organization_id, name)
  where deleted_at is null;

create index habitat_types_org_active_sort_idx
  on habitat_types (organization_id, is_active, sort_order)
  where deleted_at is null;

-- migrate:down
drop table if exists habitat_types;
drop table if exists collection_lures;
drop table if exists collection_methods;
drop table if exists organization_species;
drop table if exists species;
drop table if exists genera;
