-- migrate:up

-- Source: 202605060001_initial_identity.sql
create extension if not exists pgcrypto;
create extension if not exists postgis;

create type simmer_role as enum (
  'owner',
  'admin',
  'manager',
  'collector',
  'viewer'
);

create type membership_status as enum (
  'active',
  'inactive',
  'invited'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  workos_user_id text not null unique,
  email text not null,
  display_name text not null,
  first_name text,
  last_name text,
  email_verified boolean,
  profile_picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  workos_organization_id text unique,
  name text not null,
  slug text unique,
  settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  user_id uuid references users(id) on delete set null,
  display_name text not null,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid,
  unique (organization_id, user_id)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete restrict,
  role simmer_role not null,
  status membership_status not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

alter table organizations
  add constraint organizations_deleted_by_profile_id_fkey
  foreign key (deleted_by_profile_id) references profiles(id) on delete set null;

alter table profiles
  add constraint profiles_deleted_by_profile_id_fkey
  foreign key (deleted_by_profile_id) references profiles(id) on delete set null;

create unique index memberships_one_default_per_user
  on memberships (user_id)
  where is_default and status = 'active';

create index memberships_user_status_idx on memberships (user_id, status);
create index memberships_organization_status_idx on memberships (organization_id, status);
create index profiles_organization_active_idx on profiles (organization_id, is_active);

-- Source: 202605060002_organization_subscription_metadata.sql
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

-- Source: 202605060003_invited_memberships.sql
alter table memberships
  drop constraint memberships_organization_id_user_id_key;

alter table memberships
  alter column user_id drop not null,
  add column invited_email text,
  add column workos_invitation_id text,
  add constraint memberships_user_or_invited_email_check
    check (user_id is not null or invited_email is not null);

create unique index memberships_organization_user_unique
  on memberships (organization_id, user_id)
  where user_id is not null;

create unique index memberships_organization_invited_email_unique
  on memberships (organization_id, lower(invited_email))
  where user_id is null and status = 'invited' and invited_email is not null;

create unique index profiles_organization_pending_email_unique
  on profiles (organization_id, lower(email))
  where user_id is null and email is not null and deleted_at is null;

-- migrate:down

-- Source: 202605060003_invited_memberships.sql
drop index if exists profiles_organization_pending_email_unique;
drop index if exists memberships_organization_invited_email_unique;
drop index if exists memberships_organization_user_unique;

alter table memberships
  drop constraint if exists memberships_user_or_invited_email_check,
  drop column if exists workos_invitation_id,
  drop column if exists invited_email;

delete from memberships
where user_id is null;

alter table memberships
  alter column user_id set not null,
  add constraint memberships_organization_id_user_id_key unique (organization_id, user_id);

-- Source: 202605060002_organization_subscription_metadata.sql
drop index if exists organizations_subscription_status_idx;

alter table organizations
  drop column if exists subscription_notes,
  drop column if exists billing_contact_email,
  drop column if exists billing_contact_name,
  drop column if exists billing_mode,
  drop column if exists subscription_status;

drop type if exists organization_billing_mode;
drop type if exists organization_subscription_status;

-- Source: 202605060001_initial_identity.sql
drop index if exists profiles_organization_active_idx;
drop index if exists memberships_organization_status_idx;
drop index if exists memberships_user_status_idx;
drop index if exists memberships_one_default_per_user;
drop table if exists memberships;
drop table if exists profiles;
drop table if exists organizations;
drop table if exists users;
drop type if exists membership_status;
drop type if exists simmer_role;

