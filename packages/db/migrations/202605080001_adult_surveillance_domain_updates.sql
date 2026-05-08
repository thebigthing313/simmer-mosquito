-- migrate:up

create type collection_timing_mode as enum (
  'exact_timestamps',
  'collection_date_duration'
);

alter table units
  add column code text;

update units
set code = lower(regexp_replace(unit_name, '[^a-zA-Z0-9]+', '_', 'g'))
where code is null;

alter table units
  alter column code set not null;

create unique index units_code_unique
  on units (code);

alter table collections
  rename column is_non_mosquito to has_bycatch;

alter table collections
  add column collection_timing_mode collection_timing_mode not null default 'exact_timestamps',
  add column collection_date date,
  add column duration_amount double precision,
  add column duration_unit_id uuid references units(id) on delete restrict;

alter table collections
  add constraint collections_exact_timing_chronological
    check (
      collection_timing_mode <> 'exact_timestamps'
      or collected_at is null
      or started_at is null
      or collected_at >= started_at
    ),
  add constraint collections_date_duration_positive
    check (
      collection_timing_mode <> 'collection_date_duration'
      or duration_amount > 0
    ),
  add constraint collections_timing_shape
    check (
      (
        collection_timing_mode = 'exact_timestamps'
        and started_at is not null
        and collection_date is null
        and duration_amount is null
        and duration_unit_id is null
      )
      or (
        collection_timing_mode = 'collection_date_duration'
        and started_at is null
        and collected_at is null
        and collection_date is not null
        and duration_amount is not null
        and duration_unit_id is not null
      )
    );

create index collections_organization_collection_date_idx
  on collections (organization_id, collection_date desc, created_at desc)
  where deleted_at is null and collection_date is not null;

create index collections_duration_unit_idx
  on collections (duration_unit_id)
  where deleted_at is null and duration_unit_id is not null;

-- migrate:down

drop index if exists collections_duration_unit_idx;
drop index if exists collections_organization_collection_date_idx;

alter table collections
  drop constraint if exists collections_timing_shape,
  drop constraint if exists collections_date_duration_positive,
  drop constraint if exists collections_exact_timing_chronological;

alter table collections
  drop column if exists duration_unit_id,
  drop column if exists duration_amount,
  drop column if exists collection_date,
  drop column if exists collection_timing_mode;

alter table collections
  rename column has_bycatch to is_non_mosquito;

drop index if exists units_code_unique;

alter table units
  drop column if exists code;

drop type if exists collection_timing_mode;
