# Weather Domain Decisions

This captures the weather command decisions from the domain interview. V1 is
agency-uploaded weather summary data only. Provider feeds, NWS sources,
subscriptions, server-side raw observation aggregation, persisted import
sessions, and detailed sync design are deferred.

## Command Boundary

Weather commands live in a framework-agnostic domain module:

- `packages/domain/src/weather.ts`

Commands use the `weather.*` namespace and carry agency command context:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative and verifies both IDs. SIMMER
operator repair tooling, if needed later, is separate from `weather.*`.

Weather is a web-only management workflow in v1. Mobile may read weather data in
future product surfaces, but mobile/offline command queues do not create weather
stations, summaries, or imports.

## V1 Scope

V1 supports agency-created weather stations and agency-entered bucket summary
data.

Out of scope for v1:

- NWS/provider-backed weather sources.
- Shared/global source subscriptions.
- `weather_source_subscriptions` product behavior.
- Server-side parsing or persisted upload sessions.
- Stored CSV/XLS/XLSX files, import batches, row provenance, or raw rows.
- Raw/hourly observations.
- Server-side aggregation from raw observations into daily or multi-day buckets.
- Per-summary station/location snapshots.
- Automatic retry, backfill, or recompute jobs.

The existing `weather_sources.source_type` column remains, but agency commands
always create and manage `source_type = 'organization'` rows with
`provider_source_id = null`. The `nws` source type is future plumbing only.

## Weather Stations

Domain language uses "weather station" even though the current table is
`weather_sources`.

Station commands:

- `weather.createWeatherStation`
- `weather.updateWeatherStationDetails`
- `weather.updateWeatherStationLocation`
- `weather.deactivateWeatherStation`
- `weather.reactivateWeatherStation`
- `weather.deleteWeatherStation`

Station fields:

- client-generated `weatherStationId`
- required `stationName`
- optional `stationCode`
- required Point GeoJSON `geometry`
- optional `metadata` JSON object

Station names are required, trimmed, limited to 200 characters, and unique per
organization after trim/case-fold among non-deleted stations. Station codes are
optional, trimmed, limited to 100 characters, empty-to-null, and unique per
organization after trim/case-fold when non-null among non-deleted stations.

Stations are point-only. Commands carry GeoJSON geometry; the server derives
`feature_id` using the shared spatial feature pipeline and point precision
policy. Stations do not reference addresses in v1.

New stations are active. Deactivation and reactivation are idempotent. Inactive
stations remain visible for reports, filters, and data cleanup. Deleted stations
are hidden from normal product surfaces.

Changing station name or code requires
`acknowledgedHistoricalStationIdentityChange` when summaries exist. Changing
station location requires `acknowledgedHistoricalLocationChange` when summaries
exist because summaries do not snapshot station location.

Deleting a station is an explicit cleanup action. It hard-deletes all
`weather_summaries` for the station, then soft-deletes the station. If summaries
exist, `deleteWeatherStation` requires `acknowledgedSummaryDeletion`. The station
does not have to be inactive before deletion.

Station mutation commands include optional `expectedUpdatedAt`. If supplied and
stale, server handlers reject with a conflict. If omitted, last-write-wins.

## Weather Summaries

Weather summaries are agency-managed bucket aggregate records, not raw
observations.

Summary commands:

- `weather.createWeatherSummary`
- `weather.updateWeatherSummary`
- `weather.deleteWeatherSummary`
- `weather.commitWeatherSummaryImport`

Summary date buckets use agency-local calendar dates from organization settings.
The server resolves the organization timezone, defaulting to
`America/New_York`, for future-date checks. Summaries do not store a per-row
timezone.

Buckets use inclusive `startDate` and inclusive `endDate`. Same-day buckets
store `endDate = startDate`; domain commands never emit `endDate = null`.
Minimum granularity is one calendar day, but multi-day buckets are valid for
workflows such as rain gauges collected every three days.

For multi-day buckets:

- `precipitationInches` is the total precipitation over the bucket.
- `temperatureMinF` and `temperatureMaxF` are min/max over the bucket.
- `relativeHumidityMin` and `relativeHumidityMax` are min/max over the bucket.
- `windSpeedMinMph` and `windSpeedMaxMph` are min/max over the bucket.

Each summary requires at least one metric. Supported v1 metrics are:

- `temperatureMinF`
- `temperatureMaxF`
- `precipitationInches`
- `relativeHumidityMin`
- `relativeHumidityMax`
- `windSpeedMinMph`
- `windSpeedMaxMph`

Canonical values are stored as Fahrenheit, inches, percent, and miles per hour.
Values must have at most two decimal places. Official upload UI normalizes to
two decimals before command creation; server/domain validation rejects extra
precision rather than silently rounding.

Metric bounds:

- temperature Fahrenheit: -100 to 160
- precipitation inches: 0 to 500
- relative humidity percent: 0 to 100
- wind speed mph: 0 to 300

Min/max pairs must be ordered when both values are present.

Summary rows are unique by station, `startDate`, and `endDate`. Partial overlaps
with any existing summary for the same station are rejected by server command
handlers. Adjacent buckets are allowed; shared inclusive dates are overlaps.

Manual `createWeatherSummary` requires an active, non-deleted station.
`updateWeatherSummary` and `deleteWeatherSummary` may operate on active or
inactive stations, but never deleted stations. Summary deletes are hard deletes
and are not idempotent.

Manual summary create uses a client-generated `weatherSummaryId`. Manual update
targets `weatherSummaryId`, uses patch semantics, and allows changing dates and
metrics as long as the final row is valid and non-overlapping. Explicit `null`
clears a metric; `undefined` means no change. Update and delete include optional
`expectedUpdatedAt`.

Summaries are not commentable, taggable, or associated with additional
personnel.

## Spreadsheet Import

CSV/XLS/XLSX parsing and column/unit mapping are web-client concerns. The domain
and server accept only normalized SIMMER-shaped summary rows.

Upload flow:

1. User opens a station.
2. User selects a CSV/XLS/XLSX file.
3. Web parses locally and maps columns/units.
4. Web normalizes values to canonical fields with two-decimal precision.
5. Web assesses rows against loaded existing station summaries.
6. User reviews insert/update/no-change/fail counts and row details.
7. User commits selected attemptable rows with acknowledgement flags as needed.
8. Server re-assesses current database state and writes allowed rows.

Assessment is not persisted. There are no resumable upload sessions in v1.

`weather.commitWeatherSummaryImport` is station-scoped and accepts up to 5,000
rows. Rows include:

- `clientRowId`, a temporary upload-session identifier for result correlation
- client-generated `weatherSummaryId`
- `startDate`
- `endDate`
- every canonical metric field as `number | null`

The supplied `weatherSummaryId` is used for inserts. For update or no-change
rows, the server ignores the proposed ID and returns the existing summary ID.
Every proposed summary ID still must be a valid UUID and unique within the
payload.

The server computes authoritative row assessment. The client never sends trusted
row statuses. Possible assessment actions are:

- `insert`
- `update`
- `noChange`
- `fail`

Commit results use:

- `inserted`
- `updated`
- `noChange`
- `failed`

`noChange` rows are successful no-ops and do not update audit fields.

Rows with exact existing station/date buckets update only when values differ.
Import updates use full-row replacement semantics: all metric fields in the
submitted row replace the existing metric set, with nulls clearing values.

Rows that overlap existing non-exact buckets fail. Duplicate exact buckets or
overlaps within the submitted payload fail the later submitted row; the first
valid row wins by submitted order.

Partial success is allowed only with consent:

- if any row would update and `acknowledgedUpdates` is missing, the server
  rejects the batch with no writes;
- if any submitted row fails and `acknowledgedPartialImport` is missing, the
  server rejects the batch with no writes;
- when required acknowledgements are present, valid rows insert/update/no-op and
  invalid rows are returned as row-level failures.

Blank spreadsheet rows should be ignored by the web mapper before normalized
domain rows are created. A submitted row with all metrics null fails validation;
blank rows are not deletion requests.

## Permissions

Weather agency command permissions:

- owner/admin/manager: full station, summary, and import management
- collector/viewer: read-only

SIMMER operators do not bypass agency roles through `weather.*`. If a SIMMER
operator is also an agency member, they act through that agency membership.

## Sync

Detailed Electric/TanStack DB sync design is deferred. One v1 constraint is
settled: weather summaries are not baseline synced. Station catalogs are small
enough to sync later if needed for selected-organization context, but summary
rows should be loaded by station/date/report need.

## Validation Boundary

Pure command builders validate context-free rules:

- UUID shape
- command context
- point geometry shape for stations
- required and nullable text normalization
- metadata JSON object/null shape
- date shape and real calendar dates
- explicit `endDate`
- date order when both dates are visible
- metric bounds, two-decimal precision, min/max ordering, and at-least-one
  metric
- empty patch rejection
- import row count limit
- duplicate client row IDs, proposed summary IDs, date buckets, and overlaps
  within an import payload
- acknowledgement flags carried through

Server command handlers validate context-dependent rules:

- actor role and `AuthContext`
- command context matches `AuthContext`
- same-organization station ownership
- `source_type = 'organization'` and `provider_source_id is null`
- active/non-deleted station state for creates/imports
- active or inactive but non-deleted station state for summary edits/deletes
- optional optimistic concurrency
- current organization-local date for future-date rejection
- exact uniqueness and partial overlap against stored summaries
- historical station identity/location acknowledgement requirements
- station cleanup summary deletion acknowledgement
- batch-level update and partial-import acknowledgement requirements

Errors should use structured issue paths matching command payload names, for
example:

- `stationName`
- `geometry`
- `startDate`
- `temperatureMinF`
- `rows.3.weatherSummaryId`
- `rows.3.dateRange`

## Domain Module Shape

`packages/domain/src/weather.ts` should export:

- `WeatherCommandType`
- `WeatherCommand`
- station command input and payload types
- summary command input and payload types
- import row, assessment, result, and count types
- `WeatherStationStatus`
- `deriveWeatherStationStatus`
- `isSingleDayWeatherBucket`
- `WEATHER_SUMMARY_METRIC_FIELDS`
- `WEATHER_METRIC_BOUNDS`
- `WEATHER_METRIC_DECIMAL_PLACES`
- command builder functions for every `weather.*` command
- `assessWeatherSummaryImportRows`

Keep the module framework-agnostic:

- no DB access
- no React/platform dependencies
- `LocalDateString` for date buckets
- `Date` objects for optimistic timestamps
- patch semantics for manual updates
- full-row replacement semantics for import updates
- `DomainValidationError` with structured issues

## Schema Backlog

Concrete schema follow-up for v1:

```sql
update weather_summaries
  set end_date = start_date
  where end_date is null;

alter table weather_summaries
  alter column end_date set not null;
```

Implement as a migration by first backfilling existing null `end_date` values to
`start_date`, then setting `end_date not null`. Keep the date range check.

Add summary audit profile fields:

```sql
alter table weather_summaries
  add column created_by_profile_id uuid references profiles(id) on delete set null,
  add column updated_by_profile_id uuid references profiles(id) on delete set null;
```

Add metric bounds checks for the v1 sanity ranges. Keep existing min/max
ordering checks.

Replace or supplement weather station indexes with normalized uniqueness:

```sql
create unique index weather_sources_organization_normalized_name_unique
  on weather_sources (organization_id, lower(trim(source_name)))
  where deleted_at is null;

create unique index weather_sources_organization_normalized_code_unique
  on weather_sources (organization_id, lower(trim(source_code)))
  where deleted_at is null and source_code is not null;
```

Once `end_date` is non-null, a normal unique index or constraint on
`(weather_source_id, start_date, end_date)` is sufficient for exact duplicates.

Do not add for v1:

- persisted import/session tables
- raw row or filename provenance
- summary soft-delete fields
- per-summary location/name snapshots
- `btree_gist` or DB exclusion constraints for overlap
- new weather source type enum values
- address links for stations
- comment/tag/additional-personnel targets

The no-overlap invariant and two-decimal precision are command-handler
invariants in v1. Future direct database scripts or admin imports must use
command-equivalent validation.

## Testing Expectations

When implemented, add focused unit tests for:

- station command validation
- station status derivation
- summary metric bounds and precision
- date bucket validation
- manual create/update/delete builders
- import assessment insert/update/no-change/fail classification
- duplicate and overlap handling
- acknowledgement flags carried through
- 5,000-row import limit
