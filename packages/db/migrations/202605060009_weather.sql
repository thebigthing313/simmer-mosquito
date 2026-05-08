-- migrate:up

-- Source: 202605060026_weather_summaries.sql
create type weather_source_type as enum (
  'organization',
  'nws'
);

create table weather_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete restrict,
  feature_id uuid not null references spatial_features(id) on delete restrict,
  source_type weather_source_type not null,
  source_name text not null,
  source_code text,
  provider_source_id text,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create index weather_sources_organization_type_name_idx
  on weather_sources (organization_id, source_type, source_name)
  where deleted_at is null;

create index weather_sources_type_provider_source_idx
  on weather_sources (source_type, provider_source_id)
  where deleted_at is null and provider_source_id is not null;

create index weather_sources_feature_idx
  on weather_sources (feature_id)
  where deleted_at is null;

create table weather_source_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete restrict,
  weather_source_id uuid not null references weather_sources(id) on delete restrict,
  is_active boolean not null default true,
  created_by_profile_id uuid references profiles(id) on delete set null,
  updated_by_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_profile_id uuid references profiles(id) on delete set null
);

create unique index weather_source_subscriptions_organization_source_unique
  on weather_source_subscriptions (organization_id, weather_source_id)
  where deleted_at is null;

create index weather_source_subscriptions_organization_active_idx
  on weather_source_subscriptions (organization_id, is_active)
  where deleted_at is null;

create index weather_source_subscriptions_source_idx
  on weather_source_subscriptions (weather_source_id)
  where deleted_at is null;

create table weather_summaries (
  id uuid primary key default gen_random_uuid(),
  weather_source_id uuid not null references weather_sources(id) on delete cascade,
  start_date date not null,
  end_date date,
  temperature_min_f double precision,
  temperature_max_f double precision,
  precipitation_inches double precision,
  relative_humidity_min double precision,
  relative_humidity_max double precision,
  wind_speed_min_mph double precision,
  wind_speed_max_mph double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weather_summaries_source_range_unique
    unique nulls not distinct (weather_source_id, start_date, end_date),
  constraint weather_summaries_date_range_check
    check (end_date is null or end_date >= start_date),
  constraint weather_summaries_temperature_range_check
    check (temperature_min_f is null or temperature_max_f is null or temperature_min_f <= temperature_max_f),
  constraint weather_summaries_relative_humidity_range_check
    check (relative_humidity_min is null or relative_humidity_max is null or relative_humidity_min <= relative_humidity_max),
  constraint weather_summaries_wind_speed_range_check
    check (wind_speed_min_mph is null or wind_speed_max_mph is null or wind_speed_min_mph <= wind_speed_max_mph)
);

create index weather_summaries_source_start_date_idx
  on weather_summaries (weather_source_id, start_date desc);

-- migrate:down

-- Source: 202605060026_weather_summaries.sql
drop table if exists weather_summaries;
drop table if exists weather_source_subscriptions;
drop table if exists weather_sources;
drop type if exists weather_source_type;

