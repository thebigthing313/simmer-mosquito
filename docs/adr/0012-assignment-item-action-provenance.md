# 12. Assignment items carry action provenance

Date: 2026-08-11

## Status

Accepted.

## Context

Mission items and assignment items are both ordered stops on a worklist, and
both got the same progress shape in May 2026: `completed_at`, `skipped_at`, the
two `*_by_profile_id` columns, `skip_reason`, and a check constraint making
completed and skipped exclusive.

They diverged on one point. `docs/mission-dispatch-domain.md` gives mission
items a whole "Actual control action provenance" section: a nullable
`mission_item_id` on `applications`, `source_reductions`, `outreach_actions`,
and `biocontrol_actions`, plus four `missionDispatch.record*ForMissionItem`
helper commands that write the action and mark the item complete in one
transaction. `docs/field-work-support-domain.md` said the opposite in a single
sentence with no reason attached:

> Assignment items have first-class progress in v1. Progress is not explicitly
> linked to proof rows in other tables.

Instead the field-work doc told the **UI** to orchestrate: open the inspection
form, and after `larvalSurveillance.recordHabitatInspection` succeeds, send
`fieldWork.completeAssignmentItem`. Two writes, no link, and a documented
failure mode where the work is recorded but the stop stays pending.

Nothing in the repository explained the asymmetry. There was no ADR on either
side, and the sentence landed in its original commit unaccompanied. Three
plausible reasons can be reconstructed. Assignments are declared "snapshots"
that stay intelligible when their targets change; an assignment stop's record
lives in a *different domain* (larval, adult, public engagement) where a mission
item's lives next door; and assignment items are polymorphic across three target
types with no single proof shape. All three are reconstruction.

Two facts decided it:

1. **The mission side was never wired.** The columns exist and the domain
   builders exist, but no server handler ever wrote `mission_item_id`, the
   command endpoints say so explicitly, and every control-operations create page
   passes `missionItemId: null`. The "working model" the asymmetry deferred to
   was schema and vocabulary only.
2. **The link is the operationally useful half.** "What did this stop produce"
   and "which stop produced this inspection" are both ordinary questions, and
   neither was answerable. Timestamps alone say a stop was handled and nothing
   about by what.

## Decision

Assignment items carry action provenance, symmetric with mission items.

- `inspections.assignment_item_id`
- `collections.set_assignment_item_id`
- `collections.collected_assignment_item_id`

All three are `on delete set null`, mirroring the mission columns.

`collections` gets two columns because one collection row spans two field
visits: `started_at`/`set_by_profile_id` when the trap is set, and
`collected_at`/`collected_by_profile_id` when it is emptied, routinely on
different days and therefore different assignments. A single column would let
the collect visit overwrite the set visit's provenance, which is the fact most
worth keeping. Missions have no equivalent because an application is one event.

Four `fieldWork.record*ForAssignmentItem` / `set*` / `collect*` commands write
the record, set the link, and complete the stop in one transaction, with
`completeAssignmentItem` and `autoStartAssignment` defaulting to true exactly as
`MissionExecutionOptions` does.

Shared field validation moves to `packages/domain/src/surveillance-records.ts`,
a neutral top-level module in the same position `performed-control-actions.ts`
already occupies, so `field-work` can validate an inspection result without
importing `larval-surveillance`. No domain folder imports another; that holds.

The commands are reached through the record's own REST endpoint by including
`assignmentItemId` in the body. Writes in this codebase are optimistic
collection mutations mapped to per-row endpoints; a bespoke execution endpoint
would have been the only write path outside that transport.

Service request stops are **excluded**. There is no single record a service
request visit produces; the doc only ever suggested "a service request
comment", and a field-work foreign key on the polymorphic `comments` table
would be a worse artefact than the gap. They keep the two-step flow.

## Consequences

The indexes on the three new columns are **not partial**, breaking local
convention deliberately. Every comparable foreign key here is indexed `where
deleted_at is null` for soft-delete reads, and referential integrity cannot use
a partial index at all. Sixteen columns are already in that state and each one
looks covered (issue #126, `docs/deployment.md`). These are `on delete set
null`, so a hard-deleted assignment item makes Postgres scan both tables, and
`inspections` and `collections` are among the fastest-growing in the schema.

Assignments are still snapshots. The link records which stop produced a record;
it does not make the stop a live view of it. Deleting or detaching a record
leaves the stop's progress standing, as on the mission side.

The mission side was wired in the same change rather than left as follow-up, so
the pair is symmetric in fact and not only on paper. Its helpers reuse the
mission lifecycle predicates that already existed (`assertMissionItemProgress`,
`autoStartMissionIfScheduled`) and add the three checks a mission stop needs
that an assignment stop does not: the mission's `control_type` must match the
helper, the cited requested action must be the stop's unless acknowledged, and
the action geometry must cover the stop's (`ST_Covers`) unless acknowledged.
Method defaults from `missions.planned_method_id`.

The multi-record case is allowed: a stop may have several records, matching
"Multiple actual actions per mission item are allowed". A second record against
an already-completed stop needs an acknowledgement, because the ordinary cause
of one is a double submit.
