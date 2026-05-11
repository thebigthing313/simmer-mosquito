-- migrate:up

alter table inspections
  add constraint inspections_dip_count_positive
    check (dip_count is null or dip_count > 0);

alter table inspections
  add constraint inspections_larvae_count_nonnegative
    check (larvae_count is null or larvae_count >= 0);

alter table samples
  rename column is_non_mosquito to has_non_mosquito;

alter table sample_species
  drop constraint if exists sample_species_sample_id_species_id_key;

create unique index sample_species_active_sample_species_unique
  on sample_species (sample_id, species_id)
  where deleted_at is null;

-- migrate:down

drop index if exists sample_species_active_sample_species_unique;

alter table sample_species
  add constraint sample_species_sample_id_species_id_key
    unique (sample_id, species_id);

alter table samples
  rename column has_non_mosquito to is_non_mosquito;

alter table inspections
  drop constraint if exists inspections_larvae_count_nonnegative;

alter table inspections
  drop constraint if exists inspections_dip_count_positive;
