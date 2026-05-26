-- migrate:up

create or replace function pg_temp.require_no_null_organization_id(target_table regclass)
returns void
language plpgsql
as $$
declare
  has_null boolean;
begin
  execute format('select exists (select 1 from %s where organization_id is null)', target_table)
  into has_null;

  if has_null then
    raise exception 'Cannot make %.organization_id not null because some rows could not be backfilled.', target_table;
  end if;
end;
$$;

alter table spatial_feature_regions
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update spatial_feature_regions
set organization_id = region_folders.organization_id
from region_folders
where region_folders.id = spatial_feature_regions.region_folder_id
  and spatial_feature_regions.organization_id is null;

select pg_temp.require_no_null_organization_id('spatial_feature_regions');

alter table spatial_feature_regions
  alter column organization_id set not null;

create index spatial_feature_regions_organization_feature_idx
  on spatial_feature_regions (organization_id, feature_id);

alter table collection_species
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update collection_species
set organization_id = collections.organization_id
from collections
where collections.id = collection_species.collection_id
  and collection_species.organization_id is null;

select pg_temp.require_no_null_organization_id('collection_species');

alter table collection_species
  alter column organization_id set not null;

create index collection_species_organization_collection_idx
  on collection_species (organization_id, collection_id)
  where deleted_at is null;

alter table samples
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update samples
set organization_id = inspections.organization_id
from inspections
where inspections.id = samples.inspection_id
  and samples.organization_id is null;

select pg_temp.require_no_null_organization_id('samples');

alter table samples
  alter column organization_id set not null;

create index samples_organization_inspection_idx
  on samples (organization_id, inspection_id)
  where deleted_at is null;

alter table sample_species
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update sample_species
set organization_id = samples.organization_id
from samples
where samples.id = sample_species.sample_id
  and sample_species.organization_id is null;

select pg_temp.require_no_null_organization_id('sample_species');

alter table sample_species
  alter column organization_id set not null;

create index sample_species_organization_sample_idx
  on sample_species (organization_id, sample_id)
  where deleted_at is null;

alter table formulation_insecticides
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update formulation_insecticides
set organization_id = formulations.organization_id
from formulations
where formulations.id = formulation_insecticides.formulation_id
  and formulation_insecticides.organization_id is null;

select pg_temp.require_no_null_organization_id('formulation_insecticides');

alter table formulation_insecticides
  alter column organization_id set not null;

create index formulation_insecticides_organization_formulation_idx
  on formulation_insecticides (organization_id, formulation_id)
  where deleted_at is null;

alter table application_batches
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update application_batches
set organization_id = applications.organization_id
from applications
where applications.id = application_batches.application_id
  and application_batches.organization_id is null;

select pg_temp.require_no_null_organization_id('application_batches');

alter table application_batches
  alter column organization_id set not null;

create index application_batches_organization_application_idx
  on application_batches (organization_id, application_id)
  where deleted_at is null;

alter table route_items
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update route_items
set organization_id = routes.organization_id
from routes
where routes.id = route_items.route_id
  and route_items.organization_id is null;

select pg_temp.require_no_null_organization_id('route_items');

alter table route_items
  alter column organization_id set not null;

create index route_items_organization_route_position_idx
  on route_items (organization_id, route_id, position)
  where deleted_at is null;

alter table assignment_items
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update assignment_items
set organization_id = assignments.organization_id
from assignments
where assignments.id = assignment_items.assignment_id
  and assignment_items.organization_id is null;

select pg_temp.require_no_null_organization_id('assignment_items');

alter table assignment_items
  alter column organization_id set not null;

create index assignment_items_organization_assignment_position_idx
  on assignment_items (organization_id, assignment_id, position)
  where deleted_at is null;

alter table mission_items
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update mission_items
set organization_id = missions.organization_id
from missions
where missions.id = mission_items.mission_id
  and mission_items.organization_id is null;

select pg_temp.require_no_null_organization_id('mission_items');

alter table mission_items
  alter column organization_id set not null;

create index mission_items_organization_mission_position_idx
  on mission_items (organization_id, mission_id, position)
  where deleted_at is null;

alter table notification_registrations
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update notification_registrations
set organization_id = contacts.organization_id
from contacts
where contacts.id = notification_registrations.contact_id
  and notification_registrations.organization_id is null;

select pg_temp.require_no_null_organization_id('notification_registrations');

alter table notification_registrations
  alter column organization_id set not null;

create index notification_registrations_organization_contact_idx
  on notification_registrations (organization_id, contact_id)
  where deleted_at is null;

alter table notification_registration_types
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update notification_registration_types
set organization_id = notification_registrations.organization_id
from notification_registrations
where notification_registrations.id = notification_registration_types.notification_registration_id
  and notification_registration_types.organization_id is null;

select pg_temp.require_no_null_organization_id('notification_registration_types');

alter table notification_registration_types
  alter column organization_id set not null;

create index notification_registration_types_organization_registration_idx
  on notification_registration_types (organization_id, notification_registration_id)
  where deleted_at is null;

alter table mission_notifications
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update mission_notifications
set organization_id = missions.organization_id
from missions
where missions.id = mission_notifications.mission_id
  and mission_notifications.organization_id is null;

select pg_temp.require_no_null_organization_id('mission_notifications');

alter table mission_notifications
  alter column organization_id set not null;

create index mission_notifications_organization_mission_status_idx
  on mission_notifications (organization_id, mission_id, status)
  where deleted_at is null;

alter table weather_summaries
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update weather_summaries
set organization_id = weather_sources.organization_id
from weather_sources
where weather_sources.id = weather_summaries.weather_source_id
  and weather_summaries.organization_id is null;

create index weather_summaries_organization_source_start_date_idx
  on weather_summaries (organization_id, weather_source_id, start_date desc)
  where organization_id is not null;

-- migrate:down

drop index if exists weather_summaries_organization_source_start_date_idx;
alter table weather_summaries
  drop column if exists organization_id;

drop index if exists mission_notifications_organization_mission_status_idx;
alter table mission_notifications
  drop column if exists organization_id;

drop index if exists notification_registration_types_organization_registration_idx;
alter table notification_registration_types
  drop column if exists organization_id;

drop index if exists notification_registrations_organization_contact_idx;
alter table notification_registrations
  drop column if exists organization_id;

drop index if exists mission_items_organization_mission_position_idx;
alter table mission_items
  drop column if exists organization_id;

drop index if exists assignment_items_organization_assignment_position_idx;
alter table assignment_items
  drop column if exists organization_id;

drop index if exists route_items_organization_route_position_idx;
alter table route_items
  drop column if exists organization_id;

drop index if exists application_batches_organization_application_idx;
alter table application_batches
  drop column if exists organization_id;

drop index if exists formulation_insecticides_organization_formulation_idx;
alter table formulation_insecticides
  drop column if exists organization_id;

drop index if exists sample_species_organization_sample_idx;
alter table sample_species
  drop column if exists organization_id;

drop index if exists samples_organization_inspection_idx;
alter table samples
  drop column if exists organization_id;

drop index if exists collection_species_organization_collection_idx;
alter table collection_species
  drop column if exists organization_id;

drop index if exists spatial_feature_regions_organization_feature_idx;
alter table spatial_feature_regions
  drop column if exists organization_id;
