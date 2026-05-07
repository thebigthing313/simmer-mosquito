-- migrate:up
create type species_sex as enum (
  'male',
  'female'
);

create type species_status as enum (
  'damaged',
  'unfed',
  'bloodfed',
  'gravid'
);

create table collection_species (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  species_id uuid not null references species(id) on delete restrict,
  count integer not null,
  sex species_sex default 'female',
  status species_status,
  identified_by_profile_id uuid references profiles(id) on delete set null,
  identified_date date not null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null,
  constraint collection_species_count_positive
    check (count > 0)
);

create index collection_species_collection_idx
  on collection_species (collection_id)
  where deleted_at is null;

create index collection_species_species_idx
  on collection_species (species_id)
  where deleted_at is null;

create index collection_species_identified_by_idx
  on collection_species (identified_by_profile_id)
  where deleted_at is null and identified_by_profile_id is not null;

-- migrate:down
drop table if exists collection_species;
drop type if exists species_status;
drop type if exists species_sex;
