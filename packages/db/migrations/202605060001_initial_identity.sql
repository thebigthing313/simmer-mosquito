-- migrate:up
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

-- migrate:down
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
