# Mission Dispatch Domain Decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records mission
dispatch vocabulary and exceptions.

This captures the mission/dispatch command decisions from the domain interview.
It is implementation-facing and guides the `missionDispatch.*` public domain
seam at `packages/domain/src/mission-dispatch/`. Server endpoints, sync shape
design, UI workflows, imports, and spatial-feature efficiency remain separate
implementation passes.

## Command Boundary

Mission dispatch commands live in a dedicated framework-agnostic module:

- `packages/domain/src/mission-dispatch/`

The top-level file is the public seam. Its current implementation lives behind
`packages/domain/src/mission-dispatch/index.ts` so future mission parent,
mission item, and mission execution splits can stay inside the domain folder
without expanding the caller-facing import surface.

Commands use the `missionDispatch.*` namespace. Missions remain control-adjacent
planned work, but dispatch owns scheduling, assignment, ordered mission items,
mission lifecycle, item progress, and provenance to actual control actions.

Related boundaries:

- `controlOperations.*`: control catalogs, requested control actions, and actual
  performed control actions.
- `missionDispatch.*`: missions, mission items, mission lifecycle, item
  execution, and mission-to-actual-action provenance.
- `publicEngagement.*`: contacts, notification registrations, notification
  types, mission notification generation, and mission notification status
  tracking.

Every command payload includes:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative. Command context exists for command
metadata, optimistic UI, offline replay, and client-side command logs, and must
match the server-resolved context.

## Command Vocabulary

Mission parent commands:

- `missionDispatch.createMission`
- `missionDispatch.updateMissionDetails`
- `missionDispatch.updateMissionSchedule`
- `missionDispatch.updateMissionPlan`
- `missionDispatch.assignMission`
- `missionDispatch.updateMissionNotificationType`
- `missionDispatch.startMission`
- `missionDispatch.completeMission`
- `missionDispatch.cancelMission`
- `missionDispatch.reopenMission`
- `missionDispatch.deleteMission`

Mission item commands:

- `missionDispatch.addMissionItem`
- `missionDispatch.addMissionItemFromRequestedControlAction`
- `missionDispatch.updateMissionItemLocationAndLink`
- `missionDispatch.removeMissionItem`
- `missionDispatch.moveMissionItems`
- `missionDispatch.completeMissionItem`
- `missionDispatch.reopenMissionItem`
- `missionDispatch.skipMissionItem`
- `missionDispatch.unskipMissionItem`

Mission execution helper commands:

- `missionDispatch.recordChemicalApplicationForMissionItem`
- `missionDispatch.recordSourceReductionForMissionItem`
- `missionDispatch.recordOutreachActionForMissionItem`
- `missionDispatch.recordBiocontrolActionForMissionItem`

Helpers are first-class mission dispatch commands because they combine actual
control action creation with mission lifecycle/provenance behavior. They should
use the same field names and validation rules as control-operation record
commands where practical, without nesting a `controlOperations.*` command
envelope inside the mission command.

## Lifecycle Model

Mission lifecycle is derived from timestamps, not from a stored status enum.

Derived statuses:

- `scheduled`: no `started_at`, `completed_at`, `cancelled_at`, or
  `deleted_at`
- `inProgress`: `started_at` set, no terminal or delete timestamp
- `completed`: `completed_at` set
- `cancelled`: `cancelled_at` set
- `deleted`: `deleted_at` set

No `draft`, `overdue`, or mission status enum is part of v1. Overdue is a read
concern derived from schedule fields.

`completed_at` and `cancelled_at` are mutually exclusive. Add a lightweight
database check for this in the schema backlog. Reopening a completed or
cancelled mission clears only terminal state and preserves `started_at`, so the
mission returns to `inProgress`.

There is no `unstartMission` command in v1.

## Scheduling And Timezones

Mission scheduling uses exact instants plus a local rain date:

- `scheduledStartAt: Date` is required.
- `scheduledEndAt?: Date | null` is optional.
- `rainDate?: LocalDateString | null` is optional.

When an end time is present it must be strictly after the start time. The server
validates effective schedule changes against stored values.

`rainDate` is an agency-local calendar date. The server resolves organization
timezone, defaulting to `America/New_York`, and validates the rain date is on or
after the agency-local date of `scheduledStartAt`. Rain date is informational
planning metadata; it does not automatically reschedule or activate a mission.

No recurring missions, all-day mission mode, default duration, or default
notification type are part of v1.

Assigned collectors may start or progress a mission up to 12 hours before its
scheduled start. Managers may start earlier with acknowledgement. Scheduled end
time is not a hard execution gate.

## Planning Fields

`missionName` is optional, trimmed, and normalized to `null` when empty. It has
no uniqueness constraint.

`controlType` is required and uses the existing `control_type` values:

- `application`
- `source_reduction`
- `biocontrol`
- `outreach`

`plannedMethodId` is optional prospective planning metadata. It is polymorphic
by `controlType`:

- `application` -> `application_methods`
- `source_reduction` -> `source_reduction_methods`
- `biocontrol` -> `biocontrol_methods`
- `outreach` -> `outreach_methods`

Newly selected planned methods must be active, non-deleted, and same
organization. Inactive historical methods remain valid when already stored and
unchanged.

Changing `controlType` is allowed only while the mission is scheduled,
unstarted, and has no active items, generated notifications, or linked actual
actions. If `controlType` changes, `plannedMethodId` must be explicitly cleared
or replaced with a valid method for the new type.

`plannedMethodId` may be cleared. Planned method mismatch with a requested
control action's `recommendedMethodId` requires acknowledgement when creating or
updating mission items.

## Assignment And Crew Ownership

V1 missions have a single optional crew lead/responsible profile:

- `assignedToProfileId`
- `assignedByProfileId`

No mission-level crew roster table is part of v1. Actual performed work records
own primary performer attribution and additional personnel.

Managers may assign a mission to an active same-organization profile with an
active collector-and-above membership, or clear the assignee. Viewer profiles
cannot be assigned executable missions. Historical missions remain displayable
if a profile later becomes inactive or loses access.

Changing assignment after the mission starts requires acknowledgement. Completed
or cancelled missions must be reopened before assignment changes. Clearing
assignment on an in-progress mission also requires acknowledgement.

Collectors cannot self-assign missions in v1.

## Mission Items

Mission items are ordered target geometry rows. They are not typed entity
targets like assignment items.

Mission items carry:

- client-generated `missionItemId`
- parent `missionId`
- GeoJSON `geometry` or `locationSource`
- optional `addressId`
- optional `requestedControlActionId`
- fractional `position`

Mission item commands carry either explicit GeoJSON geometry or a
`locationSource`, not both. The server stores explicit geometry directly on the
mission item or snapshots the chosen source record's owned geometry. Read/sync
rows expose the mission item's owned geometry projection.

V1 geometry types:

- `Point`
- `LineString`
- `Polygon`

Multi-geometries and geometry collections remain deferred globally.

Mission item address is optional context only. Geometry is authoritative once
stored. Address geometry does not need to match mission item geometry and
mission item geometry does not follow later address edits. Commands reference
existing addresses only; mission dispatch does not create addresses inline.

No mission item `instructions`, `description`, or parent mission `description`
column is part of v1. Use mission comments for notes and planning context.

## Mission Item Sources

Mission items may be ad hoc, sourced from field records, or linked to requested
control actions.

Core command:

- `addMissionItem`: explicit geometry or location source, optional address,
  optional `requestedControlActionId`, optional placement.

Convenience command:

- `addMissionItemFromRequestedControlAction`: mission item ID, mission ID,
  requested action ID, and optional placement. It snapshots the requested
  action's current geometry and address.

`createMission` may also accept optional initial items. Initial item inputs are
discriminated:

```ts
items?: readonly (
  | {
      kind: 'explicit';
      missionItemId: DomainId;
      geometry?: SupportedGeoJsonGeometry;
      locationSource?: MissionItemLocationSource;
      addressId?: DomainId | null;
      requestedControlActionId?: DomainId | null;
    }
  | {
      kind: 'fromRequestedControlAction';
      missionItemId: DomainId;
      requestedControlActionId: DomainId;
    }
)[]
```

Mission item `locationSource` may use the requested-control-action source flow
and may additionally source from requested control action geometry. In practice,
that means explicit geometry, address geometry, habitat geometry, trap geometry,
collection geometry, inspection geometry, service request geometry, or requested
control action geometry.

Array order becomes mission item order. Initial items are always pending; create
does not set lifecycle or progress timestamps.

Requested action links are nullable and clearable. A linked requested action
must be same-organization, non-deleted, and have the same `controlType` as the
parent mission. Requested action resolution state does not block linking.

The same requested control action may appear on multiple mission items or
missions with acknowledgement. This supports split areas, retries, and multi-day
response.

Mission item creation from requested control action copies geometry and address
only. Do not duplicate habitat, inspection, or collection context columns onto
mission items.

## Ordering

Mission item ordering uses the same fractional `position` strategy as routes
and assignments.

Placement:

```ts
type MissionItemPlacement =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; missionItemId: DomainId }
  | { kind: 'after'; missionItemId: DomainId };
```

When placement is omitted, default to `{ kind: 'end' }`.

`moveMissionItems` moves one or more selected items as a group. Server handlers
resolve active items, sort selected items by current position, remove them from
the active sequence, and insert the group at the requested placement. Relative
order is preserved regardless of ID order in the payload. Anchor items must be
active items in the same mission after selected items are removed. Anchors
cannot be selected items.

Server may normalize positions internally in the same transaction if fractional
position space is exhausted. No public normalization command is part of v1.

Moving progressed items requires acknowledgement. Movement alone does not
require notification acknowledgement because notification matching uses geometry
sets, not item order.

## Item Progress

Mission items have first-class progress fields on `mission_items`, not a
separate event table:

- `completed_at`
- `completed_by_profile_id`
- `skipped_at`
- `skipped_by_profile_id`
- `skip_reason`

Derived item statuses:

- `pending`: no completed/skipped/delete timestamp
- `completed`: `completed_at` set
- `skipped`: `skipped_at` set
- `deleted`: `deleted_at` set

Completed and skipped are mutually exclusive. Add the same lightweight check
pattern as assignment items.

Commands:

- `completeMissionItem`
- `reopenMissionItem`
- `skipMissionItem`
- `unskipMissionItem`

Progress commands operate on non-deleted items only. Parent mission must be
non-deleted and not completed or cancelled. Progress commands may auto-start a
scheduled mission by default, using the same permissions and early-start rules
as `startMission`.

Progress timestamps are optional command inputs and default server-side when
omitted. They cannot be future beyond clock skew and must be on or after
mission `started_at` once effective start is known.

Both are enforced, in `apps/server/src/mission-dispatch-commands/mission-lifecycle.ts`.

"Once effective start is known" is settled as: **the mission was already started
before the command ran**. On the auto-start path the `started_at` a progress
timestamp would be compared against is the one the very command under validation
is about to stamp, so there is no prior start for it to be before and the
comparison does not apply. Auto-start writes the progress timestamp itself as
`started_at`, so a mission's window contains the work that opened it rather than
beginning after it.

The clock-skew allowance is the one in `isProgressBeforeStart`
(`apps/server/src/progress-timing.ts`), shared with field work — the two domains
state the same rule about the same pair of clocks, and one of them drifting from
the other would be a bug in whichever moved.

Not yet enforced: the early-start rule that `acknowledgedEarlyStart` exists for.
The flag rides on `startMission`, `completeMissionItem`, and `skipMissionItem`,
but this document never says what counts as early, so there is nothing to
implement against.

`skipMissionItem` requires a non-empty trimmed `skipReason` and uses plain text
only. No skip reason enum or lookup table is part of v1.

Progress transitions are strict:

- completing an already completed item is rejected
- skipping an already skipped item is rejected
- completing a skipped item requires unskip first
- skipping a completed item requires reopen first
- reopening requires completed
- unskipping requires skipped

Mission item completion is allowed without a linked actual control action.
Completion means the dispatch target was handled. Use mission comments for
richer explanation when no actual action exists.

Soft-deleting a mission item preserves progress fields on the soft-deleted row.

## Parent Lifecycle Commands

`startMission` is strict:

- rejects already started missions
- rejects completed, cancelled, or deleted missions
- requires at least one active item
- collectors require assignment to themselves
- manager-and-above may start any mission
- early-start rules apply

`completeMission`:

- requires at least one active item
- requires every active item completed or skipped
- rejects already completed, cancelled, or deleted missions
- may auto-start a scheduled mission by setting `started_at` to `completedAt`
  or server time
- does not require a completion comment
- does not require mission notifications to be completed
- does not auto-complete or mutate mission notifications

Completing or skipping all items does not automatically complete the mission.
The UI may prompt for explicit parent completion.

`cancelMission`:

- rejects already cancelled missions
- rejects completed missions unless reopened first
- requires non-empty `cancellationReason`
- requires `cancellationCommentId`
- stores `missions.cancellation_reason`
- creates a normal unpinned `mission` comment with the same text
- preserves mission items, item progress, actual actions, and mission
  notifications
- blocks future execution and notification generation
- requires acknowledgement if item progress or linked actual actions exist

`reopenMission`:

- manager-and-above only
- requires terminal completed/cancelled state
- rejects scheduled, in-progress, or deleted missions
- requires `reopenCommentId` and `reopenReason`
- creates a normal unpinned `mission` comment
- clears completed or cancelled terminal fields
- preserves `started_at`, item progress, notifications, and actual actions

`deleteMission`:

- manager-and-above only
- rejects already deleted missions
- may operate on scheduled, in-progress, completed, or cancelled missions with
  acknowledgements
- soft-deletes the mission parent
- soft-deletes active mission items
- soft-deletes direct mission comments
- soft-deletes mission notifications when acknowledged
- detaches actual actions by nulling `mission_item_id` when acknowledged
- preserves requested control actions
- does not require a delete comment

Completed and in-progress mission deletion requires explicit acknowledgements
for the relevant blast radius.

## Notifications

Mission notification generation remains in `publicEngagement.*`.

Mission dispatch owns only:

- setting/clearing `notificationTypeId`
- validating notification type selection
- lifecycle and acknowledgement rules around mission fields that affect
  notification assumptions

`notificationTypeId` is optional. Missions without a notification type are valid
and executable. `publicEngagement.generateMissionNotifications` rejects missions
with no notification type.

Newly selected notification types must be active, non-deleted, and same
organization. After mission notifications exist, changing or clearing the
mission notification type requires acknowledgement. Existing
`mission_notifications` rows are not mutated.

Generation is allowed for scheduled and in-progress missions. It is rejected for
deleted, completed, cancelled, itemless, or notification-type-less missions.
Generation uses active non-deleted mission item geometries regardless of item
progress.

Changing mission schedule after notifications exist requires acknowledgement.
Changing planned method after notifications exist also requires acknowledgement.
Existing mission notification rows remain manual tracking/worklist rows.

Notification type deactivation is blocked when scheduled or in-progress missions
reference it. Completed/cancelled mission history may retain inactive types.

## Actual Control Action Provenance

Add nullable `mission_item_id` columns to actual action tables:

- `applications`
- `source_reductions`
- `outreach_actions`
- `biocontrol_actions`

Use `references mission_items(id) on delete set null` and indexes on non-null
values. One actual action belongs to zero or one mission item. One mission item
can have many actual actions.

Actual actions still store their own geometry, address, date, method, performer,
quantity, metadata, batches, and requested action link. Mission helpers may
default from mission item, mission plan, and requested action context, but they
do not make actual action fields implicit in storage.

Recording actual work from a mission item:

- validates mission and item lifecycle
- validates helper type matches mission `controlType`
- validates requested-action compatibility
- writes the actual action with `mission_item_id`
- defaults `requested_control_action_id` from the mission item when appropriate
- carries the action's own larval/adult context (`habitatId`, `inspectionId`,
  `collectionId`) exactly as the off-mission command does — a mission-recorded
  action stores no less than the same action recorded outside one
- optionally marks the mission item complete in the same transaction
- optionally auto-starts the mission

Helper commands include:

- `completeMissionItem`, default `true`
- `autoStartMission`, default `true`
- `acknowledgedRequestedActionMismatch` — the action cites a requested action
  that is not the stop's
- `acknowledgedMissionGeometryNotCovered` — the action does not cover the ground
  the stop names
- `acknowledgedCompletedItemAdditionalAction` — a second action against a stop
  that is already completed, the mission counterpart of
  `acknowledgedCompletedItemAdditionalRecord`

There is no method or schedule acknowledgement. A mission's planned method is a
default rather than a rule, so there is nothing to disagree with, and no check
has ever compared an action's date to the mission's window; flags for either
would name rules that do not exist.

Implemented in `apps/server/src/mission-dispatch-commands/mission-execution.ts`
and reached through the action's own endpoint (`POST
/control-operations/applications`, `/source-reductions`, `/biocontrol-actions`,
`/outreach-actions`) by including `missionItemId` in the body. Outreach is
recorded from `/public-engagement/outreach` in the UI but its table and endpoint
are control-operations, like the other three. The endpoint follows the table;
the command follows the unit of work. A body without `missionItemId` builds the
ordinary `controlOperations.*` command, unchanged.

Defaults the server fills when the command omits them:

- geometry — the mission item's own geometry, so the ordinary call cannot
  disagree with the stop it came from
- `requested_control_action_id` — the stop's
- method — `missions.planned_method_id`. For source reduction, outreach, and
  biocontrol the column is required, so a mission planned without a method and
  executed without one is refused (`mission_method_required`) rather than
  invented. A chemical application's method is nullable, so the plan is a
  default there and never a requirement: refusing would make a mission-recorded
  application stricter than the same application recorded off-mission.

The mission row is locked before it is read, so the auto-start that may follow
cannot race a concurrent one.

Geometry mismatch acknowledgement is required only when actual action geometry
does not fully cover/encompass the mission item geometry. For point mission
items, coverage means the point lies on/within the action geometry or equals the
action point. This is `ST_Covers(action.geom, mission_item.geom)`, checked after
the action row is written and inside the same transaction, so a refusal rolls
the write back. A null answer — one of the geometries missing — is not "does not
cover" and is not refused.

Address mismatch is warning-only because geometry is authoritative.

`acknowledgedMissionGeometryNotCovered` and `acknowledgedRequestedActionMismatch`
are answers to a refusal rather than options the form offers up front, and reach
the endpoint the same way the assignment ones do — see "Assignment Item
Execution" in `docs/field-work-support-domain.md`. `mission_item_wrong_control_type`
and `mission_method_required` take no flag and are never offered a way past.

Mission helper commands do not automatically resolve requested control actions.
Resolution remains an explicit control-operations command.

Actual control action deletion or detach preserves mission item progress.
Managers can explicitly reopen mission items if a correction means the target is
no longer handled.

Multiple actual actions per mission item are allowed. Formulations remain a UI
convenience that expands into discrete chemical application records.

Mission helpers may include chemical application batch links. They do not create
additional personnel or comments inline. Additional personnel and comments use
shared field-work commands, except for mission cancel/reopen lifecycle comments.

## Permissions

Owner/admin/manager:

- create/update/assign/cancel/reopen/delete missions
- manage mission items
- start/complete any mission
- progress any mission item
- record actual control work for any mission item
- backfill/correct with acknowledgement flags

Assigned collector:

- start their assigned mission
- execute helper commands for assigned in-progress/scheduled missions, subject
  to auto-start rules
- complete/skip/reopen/unskip items in their assigned non-terminal mission
- complete their assigned mission when all active items are handled

Collector restrictions:

- cannot create missions
- cannot edit mission details, schedule, plan, notification type, assignee, or
  item list
- cannot cancel/reopen/delete mission parent
- cannot execute unassigned missions
- cannot add additional actions to completed/skipped items

Viewer is read-only.

SIMMER operators do not bypass agency roles through `missionDispatch.*`.

## Mobile, Offline, Sync, And Imports

Mission commands follow `docs/domain-command-contract.md`. Domain-specific
created-row IDs are:

- `missionId`
- `missionItemId`
- actual action IDs inside helper commands
- chemical application batch IDs inside helper commands
- lifecycle comment IDs for cancel/reopen

Mission-specific replay must also revalidate assignment, lifecycle,
method/product/unit validity, geometry, acknowledgement flags, and provenance
compatibility.

Detailed Electric/TanStack DB sync shape and frontend data loading are deferred
to a later frontend data-loading design slice. The command-side principle is
settled: queued offline work stores domain commands.

No dedicated mission import commands are part of v1. Normal commands are
ID-stable and backfill-friendly. Bulk import/admin tooling may use
command-equivalent validated server workflows later.

## Validation Boundary

Use the shared validation boundary in `docs/domain-command-contract.md`.
Mission-specific builder checks include `ControlType`, item input
discriminators, geometry shape, positive finite numbers, placement shape, and
mission acknowledgement flags.

Mission-specific server checks include mission lifecycle, assignee membership,
method/requested-action compatibility, schedule and rain-date comparisons in
organization timezone, notification generation impacts, item progress and
actual action linkage impacts, geometry coverage predicates, actual action
unit/product/batch compatibility, and cross-domain lifecycle effects.

## Domain Module Shape

`packages/domain/src/mission-dispatch/` exports:

- `MissionDispatchCommandType`
- `MissionDispatchCommand`
- command input and payload types
- `MissionItemPlacement`
- `MissionInitialItemInput`
- `MissionItemLocationInput`
- `MissionLifecycleStatus`
- `MissionItemStatus`
- `deriveMissionLifecycleStatus`
- `deriveMissionItemStatus`
- builder functions for every `missionDispatch.*` command

Keep implementation style consistent with `docs/domain-command-contract.md`.
Mission-specific conventions are `Date` objects for instants,
`LocalDateString` for `rainDate` and actual action dates, and patch semantics
for updates.

## Schema Backlog

These v1 schema changes are covered by
`202605140001_public_engagement_mission_dispatch_domain_updates.sql`.

Mission lifecycle check:

```sql
alter table missions
  add constraint missions_terminal_state_exclusive
  check (completed_at is null or cancelled_at is null);
```

Mission item progress:

```sql
alter table mission_items
  add column completed_at timestamptz,
  add column completed_by_profile_id uuid references profiles(id) on delete set null,
  add column skipped_at timestamptz,
  add column skipped_by_profile_id uuid references profiles(id) on delete set null,
  add column skip_reason text,
  add constraint mission_items_progress_exclusive
    check (completed_at is null or skipped_at is null);

create index mission_items_completed_idx
  on mission_items (mission_id, completed_at)
  where deleted_at is null and completed_at is not null;

create index mission_items_skipped_idx
  on mission_items (mission_id, skipped_at)
  where deleted_at is null and skipped_at is not null;
```

Actual action mission links:

```sql
alter table applications
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index applications_mission_item_idx
  on applications (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table source_reductions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index source_reductions_mission_item_idx
  on source_reductions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table outreach_actions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index outreach_actions_mission_item_idx
  on outreach_actions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;

alter table biocontrol_actions
  add column mission_item_id uuid references mission_items(id) on delete set null;

create index biocontrol_actions_mission_item_idx
  on biocontrol_actions (mission_item_id)
  where deleted_at is null and mission_item_id is not null;
```

Do not add in v1:

- mission status enum
- mission item status enum
- skip reason enum/catalog
- mission item instructions
- mission description/notes
- mission item direct organization ID
- mission item habitat/inspection/collection context columns
- mission-level crew roster table
- route/assignment mission target support
- inline address creation inside mission dispatch commands
- formulation-specific mission helper command

## Testing Expectations

When implemented, add focused unit tests for pure builders and helpers:

- context UUID validation
- schedule and rain-date shape validation
- text normalization
- geometry validation
- initial item discriminator validation
- duplicate ID checks
- placement shape
- patch empty-change rejection
- lifecycle comment command payloads
- progress command timestamp and reason normalization
- helper command defaults and acknowledgement flags
- derived mission and item status helpers

Server-only rules such as same-organization checks, permissions, active
references, coverage predicates, lifecycle transitions, and detach behavior
belong in later server command-handler integration tests.
