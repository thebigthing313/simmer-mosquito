-- migrate:up

drop index if exists regions_organization_name_unique;

alter table organization_species
  add column deleted_at timestamptz,
  add column deleted_by_profile_id uuid references profiles(id) on delete set null;

create index organization_species_org_active_idx
  on organization_species (organization_id)
  where deleted_at is null;

alter table collection_lures
  drop column if exists custom_schema;

drop index if exists region_folders_organization_name_unique;

create unique index region_folders_organization_normalized_name_unique
  on region_folders (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists collection_methods_org_name_unique;

create unique index collection_methods_organization_normalized_name_unique
  on collection_methods (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists collection_lures_org_name_unique;

create unique index collection_lures_organization_normalized_name_unique
  on collection_lures (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists habitat_types_org_name_unique;

create unique index habitat_types_organization_normalized_name_unique
  on habitat_types (organization_id, lower(btrim(name)))
  where deleted_at is null;

alter table genera
  drop constraint if exists genera_abbreviation_key,
  drop constraint if exists genera_name_key;

create unique index genera_normalized_abbreviation_unique
  on genera (lower(btrim(abbreviation)));

create unique index genera_normalized_name_unique
  on genera (lower(btrim(name)));

alter table species
  drop constraint if exists species_genus_id_epithet_key;

drop index if exists species_special_epithet_unique;

create unique index species_genus_normalized_epithet_unique
  on species (genus_id, lower(btrim(epithet)))
  where genus_id is not null;

create unique index species_special_normalized_epithet_unique
  on species (lower(btrim(epithet)))
  where genus_id is null;

-- migrate:down

drop index if exists species_special_normalized_epithet_unique;
drop index if exists species_genus_normalized_epithet_unique;

create unique index species_special_epithet_unique
  on species (epithet)
  where genus_id is null;

alter table species
  add constraint species_genus_id_epithet_key
    unique (genus_id, epithet);

drop index if exists genera_normalized_name_unique;
drop index if exists genera_normalized_abbreviation_unique;

alter table genera
  add constraint genera_name_key unique (name),
  add constraint genera_abbreviation_key unique (abbreviation);

drop index if exists habitat_types_organization_normalized_name_unique;

create unique index habitat_types_org_name_unique
  on habitat_types (organization_id, name)
  where deleted_at is null;

drop index if exists collection_lures_organization_normalized_name_unique;

create unique index collection_lures_org_name_unique
  on collection_lures (organization_id, name)
  where deleted_at is null;

drop index if exists collection_methods_organization_normalized_name_unique;

create unique index collection_methods_org_name_unique
  on collection_methods (organization_id, name)
  where deleted_at is null;

drop index if exists region_folders_organization_normalized_name_unique;

create unique index region_folders_organization_name_unique
  on region_folders (organization_id, name)
  where deleted_at is null;

alter table collection_lures
  add column custom_schema jsonb;

drop index if exists organization_species_org_active_idx;

alter table organization_species
  drop column if exists deleted_by_profile_id,
  drop column if exists deleted_at;

create unique index regions_organization_name_unique
  on regions (organization_id, name)
  where deleted_at is null;
