-- migrate:up

-- Weather stations carry agency-specific notes, like every other record an
-- agency owns.
--
-- `docs/weather-domain.md` lists "optional `metadata` JSON object" among the
-- station fields, and `createWeatherStationCommand` and
-- `updateWeatherStationDetailsCommand` both normalize and carry one. The column
-- was missed when the domain's other schema follow-ups landed in
-- `202605130001_weather_domain_updates.sql`, so the field had nowhere to go: the
-- command endpoint accepted it, the writer had no column to put it in, and the
-- value was dropped behind a 200.
--
-- Nullable with no default, matching `regions`, `habitats` and every other
-- metadata column in the schema. A station with no notes stores null rather than
-- an empty object, so "nobody has written notes" and "somebody cleared them" are
-- the same state, which is what the domain's `metadata: JsonObject | null` says.

alter table weather_sources
  add column metadata jsonb;

-- migrate:down

alter table weather_sources
  drop column metadata;
