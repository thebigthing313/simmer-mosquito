-- migrate:up
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
