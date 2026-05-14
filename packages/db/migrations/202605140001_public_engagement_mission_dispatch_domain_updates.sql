-- migrate:up

alter table contacts
  drop column if exists fax;

drop index if exists notification_types_organization_name_unique;

create unique index notification_types_organization_normalized_name_unique
  on notification_types (organization_id, lower(btrim(name)))
  where deleted_at is null;

alter type notification_channel rename to notification_channel_old;

create type notification_channel as enum (
  'email',
  'sms',
  'phone'
);

alter table mission_notifications
  alter column channel type notification_channel
  using channel::text::notification_channel;

drop type notification_channel_old;

alter table missions
  add constraint missions_terminal_state_exclusive
    check (completed_at is null or cancelled_at is null);

alter table mission_items
  add column completed_at timestamptz,
  add column completed_by_profile_id uuid references profiles(id) on delete set null,
  add column skipped_at timestamptz,
  add column skipped_by_profile_id uuid references profiles(id) on delete set null,
  add column skip_reason text,
  add constraint mission_items_progress_exclusive
    check (completed_at is null or skipped_at is null);

create index mission_items_completed_idx
  on mission_items (mission_id, completed_at)
  where deleted_at is null and completed_at is not null;

create index mission_items_skipped_idx
  on mission_items (mission_id, skipped_at)
  where deleted_at is null and skipped_at is not null;

alter table applications
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index applications_mission_item_idx
  on applications (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table source_reductions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index source_reductions_mission_item_idx
  on source_reductions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table outreach_actions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index outreach_actions_mission_item_idx
  on outreach_actions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table biocontrol_actions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index biocontrol_actions_mission_item_idx
  on biocontrol_actions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

-- migrate:down

drop index if exists biocontrol_actions_mission_item_idx;

alter table biocontrol_actions
  drop column if exists mission_item_id;

drop index if exists outreach_actions_mission_item_idx;

alter table outreach_actions
  drop column if exists mission_item_id;

drop index if exists source_reductions_mission_item_idx;

alter table source_reductions
  drop column if exists mission_item_id;

drop index if exists applications_mission_item_idx;

alter table applications
  drop column if exists mission_item_id;

drop index if exists mission_items_skipped_idx;
drop index if exists mission_items_completed_idx;

alter table mission_items
  drop constraint if exists mission_items_progress_exclusive,
  drop column if exists skip_reason,
  drop column if exists skipped_by_profile_id,
  drop column if exists skipped_at,
  drop column if exists completed_by_profile_id,
  drop column if exists completed_at;

alter table missions
  drop constraint if exists missions_terminal_state_exclusive;

alter type notification_channel rename to notification_channel_old;

create type notification_channel as enum (
  'email',
  'sms',
  'phone',
  'fax'
);

alter table mission_notifications
  alter column channel type notification_channel
  using channel::text::notification_channel;

drop type notification_channel_old;

drop index if exists notification_types_organization_normalized_name_unique;

create unique index notification_types_organization_name_unique
  on notification_types (organization_id, name)
  where deleted_at is null;

alter table contacts
  add column fax text;
