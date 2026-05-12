# Organization Settings Domain Decisions

This captures the organization settings command and schema decisions from the
domain interview. Settings are shared command context for multiple workflows,
especially date handling, larval inspection validation, control UI behavior,
unit defaults, and public engagement context.

## Storage

V1 organization settings live in `organizations.settings` as a typed JSONB
document. Do not add dedicated settings tables or columns until a concrete
workflow needs independent queryability, per-setting permissions, history, or
partial sync behavior.

Canonical saved settings include a top-level schema version. Resolvers tolerate
missing legacy version data.

```ts
{
  schemaVersion: 1,
  timezone: "America/New_York",
  unitDefaults: {
    weight: "pound",
    distance: "mile",
    area: "acre",
    volume: "gallon",
    temperature: "fahrenheit",
    duration: "hour",
    count: "count",
    speed: "mph"
  },
  larvalSurveillance: {
    inspectionEntryPolicy: {
      mode: "hybrid",
      densityRanges: null
    }
  },
  controlOperations: {
    trackInsecticideBatches: true
  },
  publicEngagement: {
    serviceRequestContext: {
      radius: {
        amount: 0.25,
        unitCode: "mile"
      },
      timeWindow: {
        daysBefore: 14,
        daysAfter: 14
      }
    }
  }
}
```

Top-level settings are shared across domains. Domain-specific settings live
under product language namespaces such as `larvalSurveillance`,
`controlOperations`, and `publicEngagement`.

## Defaults

Missing settings resolve to defaults instead of blocking workflows.

- `timezone`: `America/New_York`
- `unitDefaults`: US customary defaults by unit type
- `larvalSurveillance.inspectionEntryPolicy.mode`: `hybrid`
- `larvalSurveillance.inspectionEntryPolicy.densityRanges`: `null`
- `controlOperations.trackInsecticideBatches`: `true`
- `publicEngagement.serviceRequestContext.radius`: `0.25 mile`
- `publicEngagement.serviceRequestContext.timeWindow`: 14 days before and 14
  days after the request date

The East Coast timezone default is intentional for the first customer segment.
Date-only domain rules use organization timezone to resolve "today" and
calendar windows. Timestamp columns remain absolute instants and are displayed
by apps in the appropriate local context.

## Validation Boundary

Settings writes are strict. Command builders and server handlers reject invalid
settings input.

Settings reads are tolerant. `resolveOrganizationSettings(raw)` returns a
resolved settings object plus non-fatal issues. It does not throw on malformed
stored JSON because legacy imports or manual edits should not break field entry.

Pure domain builders validate context-free rules:

- command context UUID shape
- valid `expectedUpdatedAt` Date when provided
- timezone support and canonicalization through `Intl`
- complete unit-default shape by unit type
- larval policy modes and density-range shape
- boolean batch-tracking setting
- positive service request radius
- nonnegative integer service request day windows

Server command handlers validate context-dependent rules:

- actor role and AuthContext organization/profile
- owner/admin permissions for all organization settings
- optional `expectedUpdatedAt` optimistic concurrency
- unit code existence and matching `unit_type`
- full-document merge and persistence

## Commands

V1 settings commands are narrow, explicit, web-management workflows:

- `organizationSettings.updateTimezone`
- `organizationSettings.updateUnitDefaults`
- `organizationSettings.updateLarvalInspectionEntryPolicy`
- `organizationSettings.updateInsecticideBatchTracking`
- `organizationSettings.updateServiceRequestContext`

Every command payload includes:

- `organizationId`
- `actorProfileId`
- optional `expectedUpdatedAt`

Server AuthContext is authoritative. Command context exists for command
metadata, optimistic UI, and replay consistency, and must match AuthContext.

All organization settings are owner/admin only. Managers, collectors, and
viewers do not manage organization settings.

## Merge Behavior

Settings commands carry only the specific setting being changed. The server
loads current `organizations.settings`, merges the narrow change, preserves
unknown root keys and unknown namespace keys, canonicalizes known settings, and
writes the full merged JSON document.

Use optional optimistic concurrency:

- if `expectedUpdatedAt` is provided and does not match the current
  `organizations.updated_at`, reject with a conflict;
- if it is omitted, allow last-write-wins.

Add nullable `organizations.updated_by_profile_id` in a future schema migration
so settings changes and other organization edits can record the acting profile.
No dedicated settings history table is part of v1.

## Timezone

Timezone is a shared top-level setting. It affects date-only rules such as:

- future-date validation
- 30-day correction windows
- route self-assignment dates
- service-request time windows

Settings commands validate and canonicalize IANA timezone names with built-in
`Intl`. The web UI should normally offer a select or autocomplete sourced from
`Intl.supportedValuesOf("timeZone")` when available.

## Unit Defaults

`unitDefaults` is top-level because units are shared by surveillance, control,
public engagement, notifications, reporting, and future workflows.

Settings store stable `units.code` values, not UUIDs. Operational rows continue
to store unit IDs. Server-side settings saves must verify that each unit code
exists and belongs to the matching unit type.

Canonical settings include every current unit type:

- `weight`
- `distance`
- `area`
- `volume`
- `temperature`
- `duration`
- `count`
- `speed`

Seed data must include the default unit codes and other commonly used units.

## Larval Inspection Entry Policy

Larval inspection entry policy is owned by the organization settings domain and
consumed by larval surveillance command validation.

Supported modes:

- `density_only`
- `count_and_dips_required`
- `hybrid`

`densityRanges` is all-or-nothing. It is either `null`, which disables
inference, or includes all four positive density buckets:

- `light`
- `medium`
- `heavy`
- `veryHeavy`

Valid density ranges are contiguous, start at `0`, do not overlap, and end with
open-ended `veryHeavy`. Zero larvae is always inferred as `none` before the
range lookup, so `light.minInclusive = 0` is a practical representation for
positive values above zero.

Queued larval inspection commands should preserve raw entry intent so the
server can re-resolve current organization settings and revalidate at execution
time. The database stores only canonical validated inspection fields. If queued
commands replay under changed settings and no longer validate, the server
rejects them with structured errors and mobile surfaces a failed-queue item for
user correction.

## Control Operations

`controlOperations.trackInsecticideBatches` defaults to `true`.

This setting controls UI/workflow visibility, not hard validation. When true,
apps render batch fields. When false, apps hide or de-emphasize them. Server
commands should still accept and persist valid batch data even when the setting
is false.

## Public Engagement

`publicEngagement.serviceRequestContext` controls default related-record
context shown around service requests.

The default is:

- records within `0.25 mile`
- control actions within 14 days before through 14 days after the request date

The radius amount must be strictly positive. The radius unit is stored as a
`units.code` and server save validation must ensure it is a distance unit.
`daysBefore` and `daysAfter` are nonnegative integers; zero means the request
date only for that side of the window.

This setting drives default queries for nearby habitats, traps, surveillance
actions, control actions, and possibly other service requests. It does not
prevent users from manually widening or narrowing a view later.

## Mobile And Sync

Selected-organization settings should be part of baseline Electric/TanStack DB
sync. They are small and needed for offline display and validation hints.

Mobile consumes synced or cached settings. Mobile does not manage organization
settings in v1. If settings are unavailable offline, mobile uses the same
defaults as the server and queued commands are revalidated by the server on
replay.

## Adding A New Setting

When adding an organization setting:

1. Choose top-level for shared primitives, or a domain namespace using product
   language.
2. Define the default in `packages/domain/src/organization-settings.ts`.
3. Add the setting to the resolved settings type and canonical default object.
4. Add tolerant read-time resolution with non-fatal issues.
5. Add a narrow command builder if the setting is mutable.
6. Preserve unknown root and namespace keys during merge.
7. Canonicalize known settings during merge.
8. Add unit tests for defaults, invalid stored JSON, strict command validation,
   and merge preservation.
9. Document server-side validation for DB-backed references such as `units.code`.
10. Update sync and UI assumptions if the setting affects offline behavior.
