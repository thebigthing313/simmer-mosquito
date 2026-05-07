-- migrate:up
drop index if exists insecticide_batches_organization_insecticide_idx;
drop index if exists application_batches_application_idx;
drop index if exists application_batches_insecticide_batch_idx;

alter table application_methods
  drop column if exists description;

alter table insecticide_batches
  drop column if exists organization_id;

alter table application_batches
  add column if not exists created_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists updated_by_profile_id uuid references profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references profiles(id) on delete set null;

create index insecticide_batches_insecticide_idx
  on insecticide_batches (insecticide_id, is_active, batch_name)
  where deleted_at is null;

create index application_batches_application_idx
  on application_batches (application_id)
  where deleted_at is null;

create index application_batches_insecticide_batch_idx
  on application_batches (insecticide_batch_id)
  where deleted_at is null;

-- migrate:down
drop index if exists application_batches_insecticide_batch_idx;
drop index if exists application_batches_application_idx;
drop index if exists insecticide_batches_insecticide_idx;

alter table application_batches
  drop column if exists deleted_by_profile_id,
  drop column if exists deleted_at,
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists updated_by_profile_id,
  drop column if exists created_by_profile_id;

alter table insecticide_batches
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

alter table application_methods
  add column if not exists description text;
