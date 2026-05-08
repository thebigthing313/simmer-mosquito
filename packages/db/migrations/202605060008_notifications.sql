-- migrate:up

-- Source: 202605060025_notifications.sql
create type notification_channel as enum (
  'email',
  'sms',
  'phone',
  'fax'
);

create type mission_notification_status as enum (
  'pending',
  'completed',
  'failed',
  'skipped'
);

create table notification_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index notification_types_organization_name_unique
  on notification_types (organization_id, name)
  where deleted_at is null;

create index notification_types_organization_active_name_idx
  on notification_types (organization_id, is_active, name)
  where deleted_at is null;

create table notification_registrations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid references addresses(id) on delete restrict,
  buffer_distance double precision,
  buffer_unit_id uuid references units(id) on delete restrict,
  has_bees boolean not null default false,
  is_no_spray boolean not null default false,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index notification_registrations_contact_idx
  on notification_registrations (contact_id)
  where deleted_at is null;

create index notification_registrations_feature_idx
  on notification_registrations (feature_id)
  where deleted_at is null;

create index notification_registrations_address_idx
  on notification_registrations (address_id)
  where deleted_at is null and address_id is not null;

create table notification_registration_types (
  id uuid primary key default gen_random_uuid(),
  notification_registration_id uuid not null references notification_registrations(id) on delete cascade,
  notification_type_id uuid not null references notification_types(id) on delete cascade,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index notification_registration_types_registration_type_unique
  on notification_registration_types (notification_registration_id, notification_type_id)
  where deleted_at is null;

create index notification_registration_types_type_idx
  on notification_registration_types (notification_type_id)
  where deleted_at is null;

alter table missions
  add column notification_type_id uuid references notification_types(id) on delete set null;

create index missions_notification_type_idx
  on missions (notification_type_id)
  where deleted_at is null and notification_type_id is not null;

create table mission_notifications (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  notification_registration_id uuid not null references notification_registrations(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  notification_type_id uuid not null references notification_types(id) on delete restrict,
  channel notification_channel not null,
  destination text,
  status mission_notification_status not null default 'pending',
  status_changed_at timestamptz,
  status_changed_by_profile_id uuid references profiles(id) on delete set null,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index mission_notifications_mission_registration_channel_unique
  on mission_notifications (mission_id, notification_registration_id, channel)
  where deleted_at is null;

create index mission_notifications_mission_status_idx
  on mission_notifications (mission_id, status)
  where deleted_at is null;

create index mission_notifications_registration_idx
  on mission_notifications (notification_registration_id)
  where deleted_at is null;

create index mission_notifications_contact_idx
  on mission_notifications (contact_id)
  where deleted_at is null;

-- migrate:down

-- Source: 202605060025_notifications.sql
drop table if exists mission_notifications;

drop index if exists missions_notification_type_idx;
alter table missions
  drop column if exists notification_type_id;

drop table if exists notification_registration_types;
drop table if exists notification_registrations;
drop table if exists notification_types;
drop type if exists mission_notification_status;
drop type if exists notification_channel;

