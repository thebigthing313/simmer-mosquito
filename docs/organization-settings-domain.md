# Organization Settings Domain Decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records organization
settings vocabulary and exceptions.

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
  speciesKeyBindings: {
    bindings: [
      { key: "a", speciesId: "…" },
      { key: "p", speciesId: "…" }
    ]
  },
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
  adultSurveillance: {
    collectionTimingMode: "exact_timestamps"
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
under product language namespaces such as `adultSurveillance`, `larvalSurveillance`,
`controlOperations`, and `publicEngagement`.

## Defaults

Missing settings resolve to defaults instead of blocking workflows.

- `timezone`: `America/New_York`
- `speciesKeyBindings.bindings`: `[]`
- `unitDefaults`: US customary defaults by unit type
- `adultSurveillance.collectionTimingMode`: `exact_timestamps`
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

Settings commands follow `docs/domain-command-contract.md`. Settings writes are
strict. Command builders and server handlers reject invalid settings input.

Settings reads are tolerant. `resolveOrganizationSettings(raw)` returns a
resolved settings object plus non-fatal issues. It does not throw on malformed
stored JSON because legacy imports or manual edits should not break field entry.

Settings-specific builder checks include `expectedUpdatedAt` shape, timezone
support/canonicalization through `Intl`, unit-default completeness, larval
policy and density-range shape, adult collection timing mode, boolean
batch-tracking setting, positive service request radius, and nonnegative service
request day windows.

The owner/admin floor is declared in `apps/server/src/command-permissions.ts`
alongside every other agency command, and read from there before the request
body is parsed — so an unauthorized caller cannot learn a payload's shape from
the validation errors (#130).

Settings-specific server checks include owner/admin permissions, optional
`expectedUpdatedAt` optimistic concurrency, unit code existence and matching
`unit_type`, and full-document merge/persistence.

## Commands

V1 settings commands are narrow, explicit, web-management workflows:

- `organizationSettings.updateTimezone`
- `organizationSettings.updateUnitDefaults`
- `organizationSettings.updateAdultCollectionTimingMode`
- `organizationSettings.updateLarvalInspectionEntryPolicy`
- `organizationSettings.updateInsecticideBatchTracking`
- `organizationSettings.updateServiceRequestContext`
- `organizationSettings.updateSpeciesKeyBindings`

Every command payload includes:

- `organizationId`
- `actorProfileId`
- optional `expectedUpdatedAt`

Server AuthContext is authoritative. Command context exists for command
metadata, optimistic UI, and replay consistency, and must match AuthContext.

All organization settings are owner/admin only. Managers, collectors, and
viewers do not manage organization settings. The same floor covers organization
details (name, contact, mailing address).

### People

Managing people — inviting somebody, and creating or editing the profiles the
agency attributes work to — is **owner/admin**, the same floor as everything
else at the top of the ladder. An agency delegates onboarding; making the owner
the only person who can add a seasonal crew member makes the owner a bottleneck
rather than a safeguard.

**Changing somebody's role is owner only**, and it is the one thing that is. An
admin who could set a role could set their own to `owner`, and a rung anyone
below it can award themselves is not a rung. The same reasoning covers
invitations, which name a role too: nobody may invite above their own role, so
an admin refused at the role endpoint cannot reach the same place by inviting a
second account instead.

This was undocumented until #121 — the server enforced owner-only for all five
people endpoints while no domain doc said so, and `roles.ts` simultaneously
claimed nothing was owner-only.

**Removing somebody** — ending their access to the agency — is **owner/admin**
with the invitation's bound: nobody removes above their own role. Removal is
onboarding in reverse, so it sits on the same floor as inviting; without the
bound, "admins may remove" would be "admins may remove every owner", and an
agency with no owner cannot appoint one. Two further refusals: nobody removes
themselves, and the last active owner stays.

The membership is deactivated rather than deleted, in SIMMER and in WorkOS
alike, and the profile is untouched — it stays assignable as field history and
goes on naming whoever recorded the work. Reinstating somebody is a new
invitation. ADR 0011 has the reasoning; #129 built it.

## Merge Behavior

Settings commands carry only the specific setting being changed. The server
loads current `organizations.settings`, merges the narrow change, preserves
unknown root keys and unknown namespace keys, canonicalizes known settings, and
writes the full merged JSON document.

Use optional optimistic concurrency:

- if `expectedUpdatedAt` is provided and does not match the current
  `organizations.updated_at`, reject with a conflict;
- if it is omitted, allow last-write-wins.

The nullable `organizations.updated_by_profile_id` schema follow-up is covered
by `202605120002_control_operations_domain_updates.sql` so settings changes and
other organization edits can record the acting profile. No dedicated settings
history table is part of v1.

## Timezone

**`settings.timezone` is the authority for every operational date.** An Agency's
day is a local operational day: a trap placed at 9pm, a collection emptied
before dawn, and an application logged at the end of a shift all belong to the
day the crew worked — not to the day it was in UTC, on the database server, or
on the laptop of whoever opened the page.

This is not only a display rule. Every date-bounded read compares against a
calendar day, so a moment filed under the wrong day at the edge of a range is
**outside the range that was asked for** — absent, not merely mislabelled. Two
people in different zones then see different answers on the same page and
neither has any way to tell.

It affects date-only rules such as:

- future-date validation
- 30-day correction windows
- route self-assignment dates
- service-request time windows

### Where the zone comes from

- **Server.** `AuthContext.timeZone`, resolved once per request when the session
  is resolved. The identity query already joins `organizations`, so the settings
  blob rides along and no read pays for a second round trip — which is what
  makes it affordable on the map-tile path.
- **Client.** `useOrganizationTimeZone()` in `apps/web`, read off the synced
  organization row. It always returns a zone; while that row is still streaming
  it resolves to `DEFAULT_ORGANIZATION_TIMEZONE`. That is deliberate — the
  obvious alternative is the browser's zone, and that is the disagreement this
  whole rule exists to remove. A default is wrong for an agency that has set
  something else, but it is wrong identically for every viewer.

### The three rules

1. **A `timestamptz` becoming a calendar date takes the Agency zone.** Use
   `localDateSql` from `packages/db/src/domains/record-display-sql.ts`, never a
   bare `::date` — that cast uses the database server's session timezone.
   `assertIanaTimeZone` guards it, because the zone is interpolated rather than
   bound.
2. **A rendered instant takes the Agency zone.** Pass `timeZone` to every
   `Intl.DateTimeFormat` / `toLocaleString` that formats a moment. This includes
   audit timestamps ("Recorded", "Updated", a comment's absolute time): they sit
   in the same lists as operational dates, and a rule that split them by kind is
   what produced the inconsistency in the first place. Relative durations
   ("3m ago") are the one exception, and only because an elapsed span is the
   same number in every zone.
3. **A `date` column takes *no* zone.** It is already a calendar day, and naming
   a zone introduces the very shift the other two rules remove — `new Date
   ('2026-08-04')` is UTC midnight, which renders as the 3rd west of Greenwich.
   Read the parts out and rebuild in UTC.
4. **A typed calendar day widened into a `timestamptz` takes the Agency zone.**
   The inverse of rule 1, and the half that has to agree with it. Use
   `operationalDayAsInstant` (a day, stamped at Agency midday) or
   `localTimeAsInstant` (a day and an `HH:MM`) from
   `apps/web/src/lib/local-date.ts`. Never `new Date(`${date}T${time}`)`, which
   is the browser's zone, and never a hard-coded `T12:00:00.000Z`, which is
   right only for zones strictly inside ±12.

   A form that also reads the stored instant back — a due time, a scheduled
   start — must read it with `localTimeOfDay` and the same zone, or an untouched
   field drifts every time the record is opened and saved.

   `operationalDayAsInstant` clamps to now while now is still on the day that
   was typed. Midday is otherwise ahead of now for most of the morning, and
   `validateOperationalDate` refuses an operational date beyond the clock-skew
   tolerance — so an unclamped stamp would reject a record keyed on the morning
   it was made. Past that day the stamp stands: a mistyped future date has to
   reach the validator that refuses it.

### Daylight saving

A zone's offset is a property of the zone **at an instant**, not of the zone.
America/New_York is UTC-5 in January and UTC-4 in July, so anything that
computes an offset once and reuses it is an hour wrong for half the year — which
is enough to move an evening's work out of the window that asked for it.

Never compute an offset; always ask the zone about the instant in question.
Postgres `at time zone` with an IANA *name* does this already (a fixed offset
like `-05:00` does not). On the client, `Intl` does it, and
`localDayStartAsTimestamp` in `apps/web/src/lib/local-date.ts` is the one place
that has to resolve an Agency midnight to a UTC instant — including the case
where the requested midnight does not exist, in a zone that springs forward at
midnight.

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

## Adult Collection Timing

`adultSurveillance.collectionTimingMode` controls whether adult collection
workflows ask for exact set/collection timestamps or for a collection date plus
duration.

Supported modes:

- `exact_timestamps`
- `collection_date_duration`

The default is `exact_timestamps` to preserve the original pending-collection
workflow. Agencies that enter records after lab arrival can choose
`collection_date_duration` and create collected records directly.

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

## Species Key Bindings

`speciesKeyBindings` maps single keyboard characters to species so identification can
be entered by key press instead of by picker. It is top-level rather than namespaced
because adult and larval identification read the same set, and the species ids come
from the global taxonomy rather than either domain's catalog.

A binding is `{ key, speciesId }` and nothing more. Sex and physiological status are
**not** bound to the key: the adult entry modal carries a sticky sex/status mode that
every press inherits, so an agency needs one key per species rather than one per
species/sex/status combination. Larval entry ignores the mode entirely.

Bindable keys are the letters `a`–`z` and digits `0`–`9`, stored and matched
lowercase. `Escape`, `Enter`, `Backspace`, `Tab`, and the arrow keys are reserved by
the entry modal (close, commit, undo, focus movement) and are never bindable.

Binding rules are strict on write and tolerant on read:

- one key binds one species, and one species holds one key — both directions are
  unique, so the modal lookup and a printed bench sheet stay unambiguous;
- the command builder rejects an unbindable key, a blank species, or either kind of
  duplicate;
- `resolveSpeciesKeyBindings` drops unusable stored entries with non-fatal issues
  instead of throwing, because a bad binding from an import or a hand edit must never
  block identification entry.

Server save validation additionally checks that every bound `speciesId` still exists
in the taxonomy — referenced-row existence the pure builder cannot see.

Default is an empty list. With no bindings, key entry stays unavailable and the modal
points an owner or admin at the setup surface.

### Scope

v1 stores one binding set per agency: shared bench workstations and printed key
sheets are the common case, and it reuses the whole settings pipeline. Per-person
bindings are anticipated but not built — `resolveEffectiveSpeciesKeyBindings({
organization, user })` is the seam, and it already prefers a non-empty personal set
over the agency set. Adding user scope is a persistence change (a `preferences`
column on `users` or `memberships`, plus a self-scoped write endpoint) behind that
one function; no consumer changes.

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
2. Define the default in `packages/domain/src/organization-settings/`.
3. Add the setting to the resolved settings type and canonical default object.
4. Add tolerant read-time resolution with non-fatal issues.
5. Add a narrow command builder if the setting is mutable.
6. Preserve unknown root and namespace keys during merge.
7. Canonicalize known settings during merge.
8. Add unit tests for defaults, invalid stored JSON, strict command validation,
   and merge preservation.
9. Document server-side validation for DB-backed references such as `units.code`.
10. Update sync and UI assumptions if the setting affects offline behavior.
