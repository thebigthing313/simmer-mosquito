-- migrate:up

-- Source: 202605060009_traps.sql
create table traps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  collection_method_id uuid not null references collection_methods(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  collection_lure_id uuid references collection_lures(id) on delete set null,
  trap_name text,
  trap_code text,
  description text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index traps_organization_active_name_idx
  on traps (organization_id, is_active, trap_name)
  where deleted_at is null;

create index traps_organization_code_idx
  on traps (organization_id, trap_code)
  where deleted_at is null and trap_code is not null;

create index traps_organization_method_idx
  on traps (organization_id, collection_method_id)
  where deleted_at is null;

create index traps_organization_address_idx
  on traps (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index traps_feature_idx
  on traps (feature_id)
  where deleted_at is null;

-- Source: 202605060010_simplify_trap_foreign_keys.sql
alter table traps
  drop constraint if exists traps_collection_method_org_fkey,
  drop constraint if exists traps_address_org_fkey,
  drop constraint if exists traps_collection_lure_org_fkey;

alter table collection_methods
  drop constraint if exists collection_methods_organization_id_id_unique;

alter table collection_lures
  drop constraint if exists collection_lures_organization_id_id_unique;

alter table addresses
  drop constraint if exists addresses_organization_id_id_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_collection_method_id_fkey'
  ) then
    alter table traps
      add constraint traps_collection_method_id_fkey
        foreign key (collection_method_id)
        references collection_methods(id)
        on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_address_id_fkey'
  ) then
    alter table traps
      add constraint traps_address_id_fkey
        foreign key (address_id)
        references addresses(id)
        on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_collection_lure_id_fkey'
  ) then
    alter table traps
      add constraint traps_collection_lure_id_fkey
        foreign key (collection_lure_id)
        references collection_lures(id)
        on delete set null;
  end if;
end;
$$;

-- Source: 202605060011_collections.sql
create table collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  trap_id uuid references traps(id) on delete set null,
  collection_method_id uuid not null references collection_methods(id) on delete restrict,
  collection_lure_id uuid references collection_lures(id) on delete set null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  collected_at timestamptz,
  collected_by_profile_id uuid references profiles(id) on delete set null,
  started_at timestamptz,
  set_by_profile_id uuid references profiles(id) on delete set null,
  has_problem boolean not null default false,
  is_zero_result boolean not null default false,
  is_non_mosquito boolean not null default false,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index collections_organization_collected_at_idx
  on collections (organization_id, collected_at desc nulls last, created_at desc)
  where deleted_at is null;

create index collections_organization_trap_idx
  on collections (organization_id, trap_id)
  where deleted_at is null and trap_id is not null;

create index collections_organization_method_idx
  on collections (organization_id, collection_method_id)
  where deleted_at is null;

create index collections_organization_address_idx
  on collections (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index collections_feature_idx
  on collections (feature_id)
  where deleted_at is null;

-- Source: 202605060012_collection_species.sql
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

-- Source: 202605060013_collection_species_enums.sql
do $$
begin
  if not exists (select 1 from pg_type where typname = 'species_sex') then
    create type species_sex as enum (
      'male',
      'female'
    );
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'species_status') then
    create type species_status as enum (
      'damaged',
      'unfed',
      'bloodfed',
      'gravid'
    );
  end if;
end;
$$;

alter table collection_species
  drop constraint if exists collection_species_sex_check,
  drop constraint if exists collection_species_status_check,
  alter column sex drop default,
  alter column sex drop not null,
  alter column sex type species_sex using sex::species_sex,
  alter column sex set default 'female'::species_sex,
  alter column status type species_status using status::species_status;

-- migrate:down

-- Source: 202605060013_collection_species_enums.sql
alter table collection_species
  alter column sex type text using sex::text,
  alter column sex set default 'female',
  alter column status type text using status::text,
  add constraint collection_species_sex_check
    check (sex is null or sex in ('male', 'female')),
  add constraint collection_species_status_check
    check (status is null or status in ('damaged', 'unfed', 'bloodfed', 'gravid'));

drop type if exists species_status;
drop type if exists species_sex;

-- Source: 202605060012_collection_species.sql
drop table if exists collection_species;
drop type if exists species_status;
drop type if exists species_sex;

-- Source: 202605060011_collections.sql
drop table if exists collections;

-- Source: 202605060010_simplify_trap_foreign_keys.sql
select 1;

-- Source: 202605060009_traps.sql
drop table if exists traps;

