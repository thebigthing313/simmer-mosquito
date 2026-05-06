-- migrate:up
create type organization_subscription_status as enum (
  'trial',
  'active',
  'suspended',
  'canceled'
);

create type organization_billing_mode as enum (
  'manual_invoice'
);

alter table organizations
  add column subscription_status organization_subscription_status not null default 'trial',
  add column billing_mode organization_billing_mode not null default 'manual_invoice',
  add column billing_contact_name text,
  add column billing_contact_email text,
  add column subscription_notes text;

create index organizations_subscription_status_idx
  on organizations (subscription_status)
  where deleted_at is null;

-- migrate:down
drop index if exists organizations_subscription_status_idx;

alter table organizations
  drop column if exists subscription_notes,
  drop column if exists billing_contact_email,
  drop column if exists billing_contact_name,
  drop column if exists billing_mode,
  drop column if exists subscription_status;

drop type if exists organization_billing_mode;
drop type if exists organization_subscription_status;
