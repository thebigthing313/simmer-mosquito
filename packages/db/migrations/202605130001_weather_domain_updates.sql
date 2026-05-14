-- migrate:up

alter table weather_summaries
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;

update weather_summaries
  set end_date = start_date
  where end_date is null;

alter table weather_summaries
  alter column end_date set not null;

alter table weather_summaries
  drop constraint weather_summaries_source_range_unique;

alter table weather_summaries
  add constraint weather_summaries_source_range_unique
  unique (weather_source_id, start_date, end_date);

alter table weather_summaries
  add constraint weather_summaries_temperature_min_bounds_check
  check (temperature_min_f is null or (temperature_min_f >= -100 and temperature_min_f <= 160)),
  add constraint weather_summaries_temperature_max_bounds_check
  check (temperature_max_f is null or (temperature_max_f >= -100 and temperature_max_f <= 160)),
  add constraint weather_summaries_precipitation_bounds_check
  check (precipitation_inches is null or (precipitation_inches >= 0 and precipitation_inches <= 500)),
  add constraint weather_summaries_relative_humidity_min_bounds_check
  check (relative_humidity_min is null or (relative_humidity_min >= 0 and relative_humidity_min <= 100)),
  add constraint weather_summaries_relative_humidity_max_bounds_check
  check (relative_humidity_max is null or (relative_humidity_max >= 0 and relative_humidity_max <= 100)),
  add constraint weather_summaries_wind_speed_min_bounds_check
  check (wind_speed_min_mph is null or (wind_speed_min_mph >= 0 and wind_speed_min_mph <= 300)),
  add constraint weather_summaries_wind_speed_max_bounds_check
  check (wind_speed_max_mph is null or (wind_speed_max_mph >= 0 and wind_speed_max_mph <= 300));

create unique index weather_sources_organization_normalized_name_unique
  on weather_sources (organization_id, lower(trim(source_name)))
  where deleted_at is null;

create unique index weather_sources_organization_normalized_code_unique
  on weather_sources (organization_id, lower(trim(source_code)))
  where deleted_at is null and source_code is not null;

-- migrate:down

drop index if exists weather_sources_organization_normalized_code_unique;
drop index if exists weather_sources_organization_normalized_name_unique;

alter table weather_summaries
  drop constraint if exists weather_summaries_wind_speed_max_bounds_check,
  drop constraint if exists weather_summaries_wind_speed_min_bounds_check,
  drop constraint if exists weather_summaries_relative_humidity_max_bounds_check,
  drop constraint if exists weather_summaries_relative_humidity_min_bounds_check,
  drop constraint if exists weather_summaries_precipitation_bounds_check,
  drop constraint if exists weather_summaries_temperature_max_bounds_check,
  drop constraint if exists weather_summaries_temperature_min_bounds_check;

alter table weather_summaries
  drop constraint weather_summaries_source_range_unique;

alter table weather_summaries
  add constraint weather_summaries_source_range_unique
  unique nulls not distinct (weather_source_id, start_date, end_date);

alter table weather_summaries
  alter column end_date drop not null;

alter table weather_summaries
  drop column updated_by_profile_id,
  drop column created_by_profile_id;
