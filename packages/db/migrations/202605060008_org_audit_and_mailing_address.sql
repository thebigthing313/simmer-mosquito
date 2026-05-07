-- migrate:up
alter table organizations
  rename column country to mailing_country;

alter table organizations
  rename column address_line_1 to mailing_address_line_1;

alter table organizations
  rename column address_line_2 to mailing_address_line_2;

alter table organizations
  rename column locality to mailing_locality;

alter table organizations
  rename column region to mailing_region;

alter table organizations
  rename column postal_code to mailing_postal_code;

alter table addresses
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table region_folders
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table regions
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table organization_species
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table collection_methods
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table collection_lures
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table habitat_types
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

-- migrate:down
alter table habitat_types
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table collection_lures
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table collection_methods
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table organization_species
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table regions
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table region_folders
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table addresses
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table organizations
  rename column mailing_country to country;

alter table organizations
  rename column mailing_address_line_1 to address_line_1;

alter table organizations
  rename column mailing_address_line_2 to address_line_2;

alter table organizations
  rename column mailing_locality to locality;

alter table organizations
  rename column mailing_region to region;

alter table organizations
  rename column mailing_postal_code to postal_code;
