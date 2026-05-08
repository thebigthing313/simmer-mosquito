-- migrate:up

-- Source: 202605060018_contacts_service_requests.sql
create type request_intake_type as enum (
  'online',
  'phone',
  'walk-in',
  'other'
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  contact_name text,
  preferred_phone text,
  alternate_phone text,
  fax text,
  email text,
  company text,
  department text,
  title text,
  wants_email boolean not null default false,
  wants_sms boolean not null default false,
  wants_phone boolean not null default false,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index contacts_organization_name_idx
  on contacts (organization_id, contact_name)
  where deleted_at is null;

create index contacts_organization_company_idx
  on contacts (organization_id, company)
  where deleted_at is null and company is not null;

create index contacts_organization_email_idx
  on contacts (organization_id, lower(email))
  where deleted_at is null and email is not null;

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  display_name integer,
  intake_type request_intake_type not null default 'online',
  request_date date not null,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  address_id uuid not null references addresses(id) on delete restrict,
  contact_id uuid not null references contacts(id) on delete restrict,
  received_by_profile_id uuid references profiles(id) on delete set null,
  details text not null,
  closed_at timestamptz,
  metadata jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index service_requests_organization_display_name_unique
  on service_requests (organization_id, display_name)
  where deleted_at is null and display_name is not null;

create index service_requests_organization_date_idx
  on service_requests (organization_id, request_date desc, created_at desc)
  where deleted_at is null;

create index service_requests_organization_contact_idx
  on service_requests (organization_id, contact_id)
  where deleted_at is null;

create index service_requests_organization_address_idx
  on service_requests (organization_id, address_id)
  where deleted_at is null;

create index service_requests_feature_idx
  on service_requests (feature_id)
  where deleted_at is null;

create index service_requests_open_idx
  on service_requests (organization_id, request_date desc, created_at desc)
  where deleted_at is null and closed_at is null;

-- Source: 202605060019_service_request_closed_by.sql
alter table service_requests
  add column closed_by_profile_id uuid references profiles(id) on delete set null;

create index service_requests_closed_by_idx
  on service_requests (organization_id, closed_by_profile_id)
  where deleted_at is null and closed_by_profile_id is not null;

-- migrate:down

-- Source: 202605060019_service_request_closed_by.sql
drop index if exists service_requests_closed_by_idx;

alter table service_requests
  drop column if exists closed_by_profile_id;

-- Source: 202605060018_contacts_service_requests.sql
drop table if exists service_requests;
drop table if exists contacts;
drop type if exists request_intake_type;

