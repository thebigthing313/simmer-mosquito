-- migrate:up

alter table organizations
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

alter table vehicles
  add column is_active boolean not null default true;

alter table equipment
  add column is_active boolean not null default true;

drop index if exists vehicles_organization_name_idx;

create index vehicles_organization_active_name_idx
  on vehicles (organization_id, is_active, vehicle_name)
  where deleted_at is null;

drop index if exists equipment_organization_name_idx;

create index equipment_organization_active_name_idx
  on equipment (organization_id, is_active, equipment_name)
  where deleted_at is null;

alter table source_reductions
  add column habitat_id uuid references habitats(id) on delete set null;

create index source_reductions_organization_habitat_idx
  on source_reductions (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

alter table requested_control_actions
  add column habitat_id uuid references habitats(id) on delete set null;

create index requested_control_actions_organization_habitat_idx
  on requested_control_actions (organization_id, habitat_id)
  where deleted_at is null and habitat_id is not null;

drop index if exists application_methods_org_name_unique;

create unique index application_methods_organization_normalized_name_unique
  on application_methods (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists source_reduction_methods_org_name_unique;

create unique index source_reduction_methods_organization_normalized_name_unique
  on source_reduction_methods (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists outreach_methods_org_name_unique;

create unique index outreach_methods_organization_normalized_name_unique
  on outreach_methods (organization_id, lower(btrim(name)))
  where deleted_at is null;

drop index if exists biocontrol_methods_org_name_unique;

create unique index biocontrol_methods_organization_normalized_name_unique
  on biocontrol_methods (organization_id, lower(btrim(name)))
  where deleted_at is null;

create unique index insecticides_organization_normalized_identity_unique
  on insecticides (
    organization_id,
    lower(btrim(trade_name)),
    lower(btrim(registration_number))
  )
  where deleted_at is null;

create unique index insecticide_batches_insecticide_normalized_name_unique
  on insecticide_batches (insecticide_id, lower(btrim(batch_name)))
  where deleted_at is null;

create unique index formulations_organization_normalized_name_unique
  on formulations (organization_id, lower(btrim(formulation_name)))
  where deleted_at is null;

create unique index equipment_organization_normalized_serial_unique
  on equipment (organization_id, lower(btrim(serial_number)))
  where deleted_at is null and serial_number is not null;

create unique index application_batches_active_application_batch_unique
  on application_batches (application_id, insecticide_batch_id)
  where deleted_at is null;

create unique index formulation_insecticides_active_formulation_insecticide_unique
  on formulation_insecticides (formulation_id, insecticide_id)
  where deleted_at is null;

alter table formulations
  add constraint formulations_diluent_ratio_nonnegative
    check (diluent_ratio >= 0);

alter table formulation_insecticides
  add constraint formulation_insecticides_ratio_positive
    check (ratio > 0);

-- migrate:down

alter table formulation_insecticides
  drop constraint if exists formulation_insecticides_ratio_positive;

alter table formulations
  drop constraint if exists formulations_diluent_ratio_nonnegative;

drop index if exists formulation_insecticides_active_formulation_insecticide_unique;
drop index if exists application_batches_active_application_batch_unique;
drop index if exists equipment_organization_normalized_serial_unique;
drop index if exists formulations_organization_normalized_name_unique;
drop index if exists insecticide_batches_insecticide_normalized_name_unique;
drop index if exists insecticides_organization_normalized_identity_unique;

drop index if exists biocontrol_methods_organization_normalized_name_unique;

create unique index biocontrol_methods_org_name_unique
  on biocontrol_methods (organization_id, name)
  where deleted_at is null;

drop index if exists outreach_methods_organization_normalized_name_unique;

create unique index outreach_methods_org_name_unique
  on outreach_methods (organization_id, name)
  where deleted_at is null;

drop index if exists source_reduction_methods_organization_normalized_name_unique;

create unique index source_reduction_methods_org_name_unique
  on source_reduction_methods (organization_id, name)
  where deleted_at is null;

drop index if exists application_methods_organization_normalized_name_unique;

create unique index application_methods_org_name_unique
  on application_methods (organization_id, name)
  where deleted_at is null;

drop index if exists requested_control_actions_organization_habitat_idx;

alter table requested_control_actions
  drop column if exists habitat_id;

drop index if exists source_reductions_organization_habitat_idx;

alter table source_reductions
  drop column if exists habitat_id;

drop index if exists equipment_organization_active_name_idx;

create index equipment_organization_name_idx
  on equipment (organization_id, equipment_name)
  where deleted_at is null;

drop index if exists vehicles_organization_active_name_idx;

create index vehicles_organization_name_idx
  on vehicles (organization_id, vehicle_name)
  where deleted_at is null;

alter table equipment
  drop column if exists is_active;

alter table vehicles
  drop column if exists is_active;

alter table organizations
  drop column if exists updated_by_profile_id;
