-- migrate:up

-- Formulations become a recipe with units, the way a product label is written:
-- "0.5 lb of material into 26 gallons of water".
--
-- The old model was dimensionless relative parts (component `ratio` against
-- `diluent_ratio`), which assumed every part of the tank was measured the same
-- way — true only for a like-for-like dilution (2 gal of concentrate in 98 gal
-- of water). It cannot express a weight of product per volume of finished mix,
-- which is how most labels state a rate.
--
-- The replacement carries units explicitly:
--   formulations.batch_size + batch_unit_id   what one batch of the mix MAKES (26 gal)
--   formulation_insecticides.amount + unit_id how much product goes in it (0.5 lb)
--
-- An application of N batch-units then works out to `amount * N / batch_size` of
-- each product, in that product's own unit. No unit conversion is involved: each
-- number stays in the unit it was entered in.
--
-- Existing rows cannot be converted mechanically — their parts have no units to
-- recover — so they are backfilled with the best available guess (a component
-- takes its insecticide's default usage unit, a batch takes gallons) and then
-- deactivated, so nothing is offered for entry until someone has restated it.

alter table formulations
  drop constraint if exists formulations_diluent_ratio_nonnegative;

alter table formulation_insecticides
  drop constraint if exists formulation_insecticides_ratio_positive;

alter table formulations
  add column batch_size double precision,
  add column batch_unit_id uuid references units(id) on delete restrict;

alter table formulation_insecticides
  add column amount double precision,
  add column unit_id uuid references units(id) on delete restrict;

update formulations
set batch_size = case when diluent_ratio > 0 then diluent_ratio else 1 end,
    batch_unit_id = coalesce(
      (select id from units where code = 'gallon' limit 1),
      (select id from units where unit_type = 'volume' order by code limit 1)
    ),
    is_active = false
where batch_size is null;

update formulation_insecticides
set amount = ratio,
    unit_id = insecticides.default_unit_id
from insecticides
where insecticides.id = formulation_insecticides.insecticide_id
  and formulation_insecticides.amount is null;

-- Anything the backfill could not resolve trips the NOT NULL below, which fails
-- the migration. That is deliberate: a row nobody can restate is a decision for
-- a person, not something a migration should quietly drop.

alter table formulations
  alter column batch_size set not null,
  alter column batch_unit_id set not null;

alter table formulation_insecticides
  alter column amount set not null,
  alter column unit_id set not null;

alter table formulations
  drop column diluent_ratio;

alter table formulation_insecticides
  drop column ratio;

alter table formulations
  add constraint formulations_batch_size_positive
  check (batch_size > 0);

alter table formulation_insecticides
  add constraint formulation_insecticides_amount_positive
  check (amount > 0);

-- migrate:down

alter table formulations
  drop constraint if exists formulations_batch_size_positive;

alter table formulation_insecticides
  drop constraint if exists formulation_insecticides_amount_positive;

alter table formulations
  add column diluent_ratio double precision not null default 0;

alter table formulation_insecticides
  add column ratio double precision;

update formulation_insecticides set ratio = amount where ratio is null;

delete from formulation_insecticides where ratio is null;

alter table formulation_insecticides
  alter column ratio set not null;

alter table formulations
  drop column batch_size,
  drop column batch_unit_id;

alter table formulation_insecticides
  drop column amount,
  drop column unit_id;

alter table formulations
  add constraint formulations_diluent_ratio_nonnegative
  check (diluent_ratio >= 0);

alter table formulation_insecticides
  add constraint formulation_insecticides_ratio_positive
  check (ratio > 0);
