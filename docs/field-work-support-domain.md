# Field-work support domain decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records field-work
support vocabulary and exceptions.

This captures shared field-work/support command and schema decisions from the
domain interview. It is intentionally implementation-facing; broader
architecture decisions remain in `docs/adr/`.

## Command groups

Comment commands are shared field-work/support workflows:

- `fieldWork.addComment`
- `fieldWork.updateComment`
- `fieldWork.deleteComment`
- `fieldWork.pinComment`
- `fieldWork.unpinComment`

Comments are not created inline by adult surveillance, larval surveillance,
control, route, assignment, or mission commands. Those domains may cascade or
re-point comments during delete and merge operations.

## Comment targets

V1 comment target types use singular domain names in command/API payloads and
map to SQL tables in the server layer.

Valid comment targets:

- `address`
- `region`
- `trap`
- `collection`
- `habitat`
- `inspection`
- `sample`
- `application`
- `sourceReduction`
- `outreachAction`
- `biocontrolAction`
- `contact`
- `serviceRequest`
- `route`
- `assignment`
- `requestedControlAction`
- `mission`

The existing `comments.entity_type` column may store these domain target type
strings. The server should reject unsupported target types and unsupported
target/entity combinations through a shared target registry.

## Comment semantics

Comments are user-authored plain-text field notes.

`addComment` requires a client-generated `commentId` so mobile/offline command
replay can be idempotent. The server derives `comments.organization_id` from the
resolved target entity and verifies that it matches the command organization.
Clients do not choose the stored organization id.

`commented_by_profile_id` is always the acting profile. Users, including
managers, cannot create comments on behalf of another profile in v1.

`commented_at` may be client-supplied and defaults to server time when omitted.
It is domain provenance for when the note was written. `created_at` remains the
server receipt/audit timestamp. Server handlers should reject future
`commented_at` values beyond a small clock-skew allowance, and should reject
values before a target's meaningful creation/date anchor when one exists.

`updateComment` changes only `comment_text`. It must not change the target,
author, comment time, or pin state. Use `pinComment` and `unpinComment` for pin
state changes.

`deleteComment` soft-deletes comments. Comments are never hard-deleted by v1
commands.

Pinned comments are not exclusive. A target may have multiple pinned comments.
Target-scoped comment views should present pinned comments first, then normal
comments, each ordered by `commented_at desc`.

V1 comments are plain text only:

- trim leading and trailing whitespace
- reject empty text
- preserve internal newlines
- enforce a generous domain-layer maximum length, such as 10,000 characters
- do not assume Markdown or rich text rendering

V1 does not add:

- system/generated comments
- visible edit history
- edit reasons
- delete reasons
- attachments or photos

Attachments and photos should be handled later by a separate file/photo domain.

## Comment permissions

Commenting is allowed by collector-and-above for any valid comment target that
belongs to the actor's organization.

Users may update or delete their own comments within a 30-day correction window.
Manager-and-above may update or delete any comment in the organization.

Pinning and unpinning comments is manager-and-above. Pinning changes the
operational prominence of a note for everyone viewing the record, so it is
supervisory curation rather than normal field entry.

Adding a comment requires the target entity to be same-organization and not
soft-deleted. Retired, inactive, closed, completed, or otherwise historical
records may still receive comments as long as they are not soft-deleted.

## Comment loading and offline behavior

Comments are expected to grow large and should not be part of the baseline
organization-wide Electric/TanStack DB sync.

Load comments on demand, scoped by target type and target id. Mobile clients may
cache fetched comment threads locally per target. Offline users can view comment
threads they already fetched and can enqueue comment commands against locally
known same-organization target records. Threads not fetched before going offline
are unavailable until the client is online again.

Server handlers remain the source of truth and revalidate target existence,
organization ownership, permissions, lifecycle state, and command invariants
when queued commands replay.

## Comment lifecycle

When a target record is soft-deleted, comments directly targeting that record
are soft-deleted as part of the same domain operation.

When a delete operation preserves child history, comments on surviving child
records are preserved. For example, deleting a habitat may detach inspections,
but inspection and sample comments remain because those records remain.

Habitat merge re-points comments directly targeting source habitats to the
target habitat. Original author, `commented_at`, and creation audit fields are
preserved. Comments are not deduplicated during merge because duplicate-looking
field notes may be meaningful.

Retiring a trap or habitat does not delete comments. Closing or completing
operational records does not delete comments.

Adult and larval surveillance lifecycle interactions:

- deleting an adult collection soft-deletes collection comments
- deleting a trap soft-deletes direct trap comments and cascaded collection
  comments when child collections are also soft-deleted
- cancelling a pending collection soft-deletes collection comments when the
  collection row itself is soft-deleted
- deleting a larval inspection soft-deletes comments on the inspection, its
  samples, and any sample-owned descendants that are also deleted
- deleting a sample soft-deletes sample comments
- deleting a habitat soft-deletes direct habitat comments, while preserving
  inspection and sample comments when those records survive

## Target registry

Comment target validation should live in a shared field-work/support target
registry. Each target resolver should know:

- domain target type
- SQL table name
- primary key column
- how to resolve organization ownership
- whether the target has soft-delete state
- whether new comments are allowed
- how direct comments are handled during delete, detach, and merge operations

Adult, larval, control, route, assignment, and mission command handlers should
use this registry instead of hand-rolling polymorphic comment checks.

## Comment schema

`comments.organization_id` is derived, denormalized data and stays that way.
Even when normal loading is target-scoped, the column earns its place in
authorization prefiltering, indexing, exports, moderation, and
organization-scoped cleanup jobs.

`comments_entity_idx` is the target-scoped active-comment index and stays:

```sql
create index comments_entity_idx
  on comments (organization_id, entity_type, entity_id, commented_at desc)
  where deleted_at is null;
```

`comments_pinned_idx` is dropped. Target-scoped loading does not need a separate
org-wide pinned index, and no org-wide pinned-comments workflow has appeared.

**Still open:** `comments.entity_type` is `text`, with no enum or check
constraint. The allowed values live in `packages/domain/src/field-work/shared.ts`
and nothing in the database enforces them.

## Tag commands

Tag commands are shared field-work/support workflows.

Tag catalog commands:

- `fieldWork.createTag`
- `fieldWork.updateTag`
- `fieldWork.activateTag`
- `fieldWork.deactivateTag`
- `fieldWork.deleteTag`

Tag assignment commands:

- `fieldWork.assignTag`
- `fieldWork.unassignTag`

Tags are not created or assigned inline by adult surveillance, larval
surveillance, control, route, assignment, or mission commands. Those domains may
cascade or re-point tag assignments during delete and merge operations.

## Tag targets

V1 tag target types use singular domain names in command/API payloads and map to
SQL tables in the server layer.

Valid v1 tag targets:

- `address`
- `region`
- `trap`
- `habitat`
- `contact`
- `serviceRequest`

Routes and assignments are intentionally not taggable in v1. Tags on
routes/assignments may become work-planning labels with different semantics, so
defer them until those workflows are clearer.

Tag target validation should use the same shared field-work/support target
registry pattern as comments, with a separate taggable allowlist.

## Tag semantics

Tags are organization-scoped labels with optional description and optional
custom color.

Tag names are unique within an organization after trimming and case folding.
Display casing is preserved from the saved `tag_name`, but `Problem`,
` problem `, and `problem` are the same tag name for uniqueness.

Tag descriptions are optional plain text:

- trim leading and trailing whitespace
- empty text becomes `null`
- enforce a domain-layer maximum length, such as 2,000 characters
- do not assume Markdown or rich text rendering

Tag colors support full custom hex values:

- accept only 6-digit sRGB hex strings in `#RRGGBB` format
- trim input
- accept lowercase or uppercase input
- normalize consistently, preferably lowercase
- reject 3-digit shorthand
- reject alpha hex
- allow `null` for no color

`assignTag` requires a client-generated `tagItemId` so mobile/offline command
replay can be idempotent. The server must still enforce one active assignment
per tag/target pair.

`unassignTag` operates by `tagItemId` only. Commands should operate on concrete
association records once they exist or sync to the client.

Inactive tags remain visible on records where already assigned. Inactive means
"not available for new assignments," not hidden from history. New `assignTag`
commands reject inactive tags. `unassignTag` may remove an inactive tag from a
record.

`deleteTag` is rare cleanup. It is allowed only when no active or historical
`tag_items` reference the tag. If a tag was ever used, deactivate it instead.

## Tag permissions

Tag catalog management is manager-and-above:

- create tags
- update tag names, descriptions, and colors
- activate tags
- deactivate tags
- delete never-used tags

Tag assignment is collector-and-above for valid tag targets that belong to the
actor's organization.

Assigning a tag requires:

- actor organization matches tag organization
- target resolves to the same organization
- tag is active and non-deleted
- target is not soft-deleted
- target type is in the taggable allowlist

Inactive, retired, closed, completed, or otherwise historical records may still
receive tags as long as they are not soft-deleted. For v1 this means retired
traps and habitats can be tagged, but deleted traps and habitats cannot.

## Tag loading and offline behavior

Tag catalog rows should be part of baseline organization sync. The catalog is
expected to be small, and clients need tag names, colors, and inactive tag
metadata offline to render existing assignments and build assignment UI.

Tag assignment rows may grow large and should be loaded target-scoped for v1.
Mobile clients may cache fetched target tag assignments locally. Offline users
can view tag assignments they already fetched and can enqueue `assignTag` or
`unassignTag` commands against locally known same-organization target records
and synced tag catalog rows.

Server handlers remain the source of truth and revalidate target existence,
organization ownership, permissions, lifecycle state, tag state, uniqueness, and
command invariants when queued commands replay.

## Tag lifecycle

When a target record is soft-deleted, tag assignments directly targeting that
record are soft-deleted as part of the same domain operation.

Retiring a trap or habitat does not remove tag assignments.

Habitat merge re-points tag assignments directly targeting source habitats to
the target habitat.

If the target habitat already has the same active tag, keep the existing target
tag item and soft-delete the duplicate source tag item. If no duplicate exists,
re-point the source tag item and preserve its original creation audit fields.

Deleting a tag is blocked if any active or historical tag assignment references
it. Deactivate used tags instead.

## Tag schema

`tag_items.organization_id` exists as derived, denormalized data. The server
derives it from the resolved tag and target organization and verifies both
match. Keeping the organization id on the association row makes target-scoped
and organization-scoped queries cheaper, and mirrors `comments` and
`additional_personnel`.

Tag names are unique per agency through a soft-delete-aware, lower-trim index:

```sql
create unique index tags_organization_normalized_name_unique
  on tags (organization_id, lower(trim(tag_name)))
  where deleted_at is null;
```

**Still open:** `tag_items.entity_type` is `text`, with no enum or check
constraint.

## Additional Personnel commands

Additional personnel commands are shared field-work/support workflows:

- `fieldWork.addAdditionalPersonnel`
- `fieldWork.removeAdditionalPersonnel`

Additional personnel are not created inline by adult surveillance, larval
surveillance, or control commands in v1. Those domains may cascade or re-point
additional personnel associations during delete and merge operations.

## Additional Personnel targets

V1 additional personnel target types use singular domain names in command/API
payloads and map to SQL tables in the server layer.

Valid v1 additional personnel targets:

- `inspection`
- `collection`
- `application`
- `sourceReduction`
- `outreachAction`
- `biocontrolAction`

Additional personnel target validation should use the same shared
field-work/support target registry pattern as comments and tags, with a
separate additional-personnel allowlist.

## Additional Personnel semantics

Additional personnel is supplemental participation metadata. It is a courtesy
feature for organizations that want to record who else participated in field
work; personnel evaluation and core attribution reporting are not in scope for
v1.

`addAdditionalPersonnel` requires a client-generated `additionalPersonnelId` so
mobile/offline command replay can be idempotent. The server must still enforce
one active row per `organizationId`, personnel profile, target type, and target
id.

`removeAdditionalPersonnel` operates by `additionalPersonnelId` only. Commands
should operate on concrete association records once they exist or sync to the
client.

Additional personnel means "other participants." Server handlers should reject
adding a profile that is already the target record's primary performer when the
target has one:

- `collections.collected_by_profile_id`
- `inspections.inspected_by_profile_id`
- `applications.applicator_profile_id`
- `source_reductions.technician_profile_id`
- `outreach_actions.technician_profile_id`
- `biocontrol_actions.technician_profile_id`

If a domain command changes a target's primary performer to a profile currently
listed as additional personnel, that command should soft-delete the now-duplicate
additional personnel row.

New additional personnel rows require the referenced profile to be active,
non-deleted, and in the same organization as the target. Existing rows remain
valid for historical display if a profile later becomes inactive. Removing an
inactive profile from a record is allowed.

Additional personnel does not:

- grant ownership or edit rights
- count as the primary inspector, collector, applicator, or technician
- affect collector correction windows
- drive core surveillance or control reports by default
- imply personnel evaluation workflows inside SIMMER v1

## Additional Personnel permissions

Adding and removing additional personnel is collector-and-above for valid
targets that belong to the actor's organization.

Collectors may add any active, non-deleted profile in the same organization.
Audit fields record who added or removed the association.

Adding additional personnel requires:

- actor organization matches target organization
- personnel profile belongs to the same organization
- personnel profile is active and non-deleted
- target is not soft-deleted
- target type is in the additional-personnel allowlist
- personnel profile is not already the target's primary performer

Inactive, retired, closed, completed, or otherwise historical target records may
still receive or remove additional personnel as long as they are not
soft-deleted.

## Additional Personnel loading and offline behavior

Additional personnel rows should be loaded target-scoped and on demand for v1.
They are supplemental detail-view attribution, not baseline workflow state.

Mobile clients may cache fetched target personnel associations locally. Offline
users can view associations they already fetched and can enqueue
`addAdditionalPersonnel` or `removeAdditionalPersonnel` commands against locally
known same-organization target records and synced profile rows.

Server handlers remain the source of truth and revalidate target existence,
organization ownership, personnel profile state, permissions, lifecycle state,
primary performer conflicts, uniqueness, and command invariants when queued
commands replay.

## Additional Personnel lifecycle

When a target record is soft-deleted, additional personnel rows directly
targeting that record are soft-deleted as part of the same domain operation.

Deleting a collection, inspection, application, source reduction, outreach
action, or biocontrol action cascades its direct additional personnel rows.

Habitat merge does not affect additional personnel directly in v1 because
habitats are not additional-personnel targets.

If a future merge operation re-points a target type that can have additional
personnel, duplicate active rows should be deduped by keeping the target row and
soft-deleting duplicate source rows.

## Additional Personnel schema

`additional_personnel.organization_id` is derived, denormalized data and stays
that way. The server derives it from the resolved target and personnel profile
organization, verifies both match the actor organization, and stores that
organization id. Clients do not choose a different stored organization id.

**Still open:** `additional_personnel.entity_type` is `text`, with no enum or
check constraint.

## Route commands

Route commands are shared field-work/support workflows:

- `fieldWork.createRoute`
- `fieldWork.updateRouteDetails`
- `fieldWork.deleteRoute`
- `fieldWork.addRouteItem`
- `fieldWork.updateRouteItem`
- `fieldWork.removeRouteItem`
- `fieldWork.moveRouteItems`

V1 does not need a public route-position normalization command. Position
normalization may exist as an internal server fallback inside move/add
transactions if fractional position space is exhausted.

## Route semantics

Routes are reusable ordered lists of stable catalog targets. V1 routes remain
typed as either trap routes or habitat routes.

Route types:

- `trap`
- `habitat`

A `trap` route may contain only trap route items. A `habitat` route may contain
only habitat route items. Mixed routes are not allowed in v1. Collections,
inspections, applications, service requests, missions, and other operational
transaction records are not route item targets in v1.

`createRoute` requires a client-generated `routeId`.

Route names are unique within an organization across all route types after
trimming and case folding. Display casing is preserved from the saved
`route_name`, but `North Zone`, ` north zone `, and `north zone` are the same
route name for uniqueness.

`routeType` is immutable after creation. `updateRouteDetails` may rename the
route, but it must not change `route_type`.

`deleteRoute` soft-deletes the route and active route items. Deleting a route
with active items requires explicit acknowledgement that active route items will
also be soft-deleted.

Deleting a route does not modify existing assignments or assignment items.
Assignments are snapshots of planned work for a day/person. Once created, they
should remain intelligible even if the reusable route template is later deleted.

## Route item semantics

`addRouteItem` requires a client-generated `routeItemId`.

Adding a route item requires:

- route belongs to actor organization
- route is not soft-deleted
- target type matches route type
- target belongs to the same organization
- target is active and not soft-deleted
- route does not already have an active item for the same target

Retired or inactive traps/habitats cannot be added as new route items. Existing
route items remain visible until a lifecycle command removes them. Retiring a
trap or habitat should soft-delete active route items targeting that record,
with acknowledgement when route items will be removed. Reactivating a trap or
habitat does not restore old route items automatically.

Route item duplicates are blocked only within the same route. The same trap or
habitat may appear in multiple routes.

`addRouteItem` accepts optional placement:

```ts
placement?:
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; routeItemId: string }
  | { kind: 'after'; routeItemId: string }
```

When placement is omitted, default to `{ kind: 'end' }`.

`updateRouteItem` edits only `directionsToNextItem`. Changing the target entity
is semantically remove old route item plus add a new route item.

`directionsToNextItem` belongs to the item being departed from. It describes
how to get from that stop to the next active stop in route order. The last
active item may have `null`. When items move, directions stay attached to their
item unless explicitly edited. The UI may prompt users to review adjacent
directions after moves.

`removeRouteItem` soft-deletes only the selected route item. It does not rewrite
unaffected neighboring route item positions.

## Route item movement

`moveRouteItems` is the primary route reordering command. It supports moving one
or more selected stops as a group.

Payload shape:

```ts
{
  routeId: string;
  routeItemIds: string[];
  placement:
    | { kind: 'start' }
    | { kind: 'end' }
    | { kind: 'before'; routeItemId: string }
    | { kind: 'after'; routeItemId: string };
}
```

This supports:

- move up/down by using before/after adjacent items
- move to start
- move to end
- move one selected stop
- move many selected stops as a group
- move after a displayed stop number by resolving the stop number to an anchor
  route item

Server handlers should resolve active route items, sort selected items by their
current `position`, remove them from the active route sequence, then insert the
group at the requested placement. The selected items' relative route order is
preserved regardless of the order of ids in the payload.

For `before` and `after` placements, the anchor route item must be an active
item in the same route after the selected items are removed from the sequence.
Reject anchors that are themselves selected.

Route item `position` is `double precision` specifically to support minimal
writes. `moveRouteItems` should update only the moved items' positions.
`removeRouteItem` should not renumber remaining active items. `addRouteItem`
should assign only the new item's position. UI stop numbers are derived at read
time by sorting active items by `position`; stored positions do not need to be
contiguous integers.

If a move or add cannot safely fit positions between neighboring active items
because of numeric precision exhaustion, the server may normalize active route
item positions internally inside the same transaction, then apply the requested
change. No public v1 normalization command is required.

## Route permissions

Route and route item management is manager-and-above.

Collectors may follow or view routes through assignment/mobile workflows later,
but shared route catalog editing is supervisory operational planning.

## Route loading and offline behavior

Active routes and route items should be part of baseline organization sync.
Route catalogs are operational planning data, likely much smaller than comments,
and mobile field users need routes available offline to build or follow
assignments.

Route commands should support command-shaped offline replay technically:

- client-generated `routeId`
- client-generated `routeItemId`
- server revalidation on replay
- visible command failure on conflict

Product UX can still treat route editing as normally online and web-first for
manager workflows.

Server handlers remain the source of truth and revalidate route existence,
organization ownership, permissions, target state, route type, placement
anchors, uniqueness, and command invariants when queued commands replay.

## Route schema

Route names are unique per agency through a soft-delete-aware, lower-trim index:

```sql
create unique index routes_organization_normalized_name_unique
  on routes (organization_id, lower(trim(route_name)))
  where deleted_at is null;
```

`route_items.position` is `double precision`, so reordering writes only the rows
that moved.

**Still open:** `route_items.entity_type` is `text`, with no enum or check
constraint.

## Assignment commands

Assignment commands are shared field-work/support workflows:

- `fieldWork.createAssignment`
- `fieldWork.createAssignmentFromRoute`
- `fieldWork.updateAssignmentDetails`
- `fieldWork.addAssignmentItem`
- `fieldWork.updateAssignmentItem`
- `fieldWork.removeAssignmentItem`
- `fieldWork.moveAssignmentItems`
- `fieldWork.startAssignment`
- `fieldWork.completeAssignment`
- `fieldWork.cancelAssignment`
- `fieldWork.reopenAssignment`
- `fieldWork.deleteAssignment`
- `fieldWork.completeAssignmentItem`
- `fieldWork.reopenAssignmentItem`
- `fieldWork.skipAssignmentItem`
- `fieldWork.unskipAssignmentItem`

Assignment planning and item progress are field-work/support concerns. Adult
surveillance, larval surveillance, and service-request commands do not embed
assignment mutations in v1. Product UI may orchestrate a target workflow command
followed by an assignment item progress command.

## Assignment semantics

Assignments are ordered worklists for a day/person. They are snapshots with
references, not live views of routes or target records.

V1 assignment item targets:

- `trap`
- `habitat`
- `serviceRequest`

Assignments may mix item target types. A field technician's day may include
traps, habitats, and service requests in one ordered worklist. Do not add
`assignment_type` in v1.

`createAssignment` and `createAssignmentFromRoute` require a client-generated
`assignmentId`.

`createAssignmentFromRoute` creates an assignment from one route only in v1. It
snapshots active route items into assignment items:

- item target type and id
- item order/position
- `directionsToNextItem`

The client should provide generated `assignmentItemId` values for each
snapshotted route item, mapped to the source route item ids, so offline replay
and idempotency stay clean.

Later route edits or route deletion do not rewrite existing assignment items.
Later assignment item edits do not affect route items. Later target detail
changes may display current target details, but the assignment's item list and
order remain stable.

`assigned_by_profile_id` is set server-side to the acting profile on assignment
creation and whenever `assigned_to_profile_id` changes. Clients cannot spoof
`assignedByProfileId`.

Unassigned assignments are allowed for manager-created planning drafts.
Unassigned assignments cannot be started, completed, or item-progressed by
collectors.

## Assignment details and lifecycle

Assignment lifecycle state is derived from timestamps:

- `not_started`: `started_at`, `completed_at`, and `cancelled_at` are null
- `in_progress`: `started_at` is set, `completed_at` and `cancelled_at` are null
- `completed`: `completed_at` is set
- `cancelled`: `cancelled_at` is set

Do not add a separate status column in v1.

`updateAssignmentDetails` may edit assignment planning fields such as:

- assignment name
- assignment date
- assigned profile
- due date/time

`startAssignment`, `completeAssignment`, and `cancelAssignment` may accept
client-supplied timestamps for offline use and default to server time when
omitted. Server handlers should reject future timestamps beyond a small
clock-skew allowance. `completeAssignment` requires the assignment to already be
started; it does not auto-start.

`startAssignment` rejects completed and cancelled assignments. It is allowed on
an assignment that is already in progress, so a manager can correct a start time
without reopening first.

Cancellation is allowed before or after start. `cancellationReason` is optional
plain text and should be trimmed/null-normalized.

`reopenAssignment` is manager-and-above only. It applies only to completed or
cancelled assignments:

- completed assignment: clear `completed_at`
- cancelled assignment: clear `cancelled_at` and `cancellation_reason`
- preserve `started_at` if it existed

Reject `reopenAssignment` for assignments that are not completed or cancelled.

`deleteAssignment` soft-deletes the assignment and active assignment items.
Deleting an assignment with active items requires acknowledgement that active
items will also be soft-deleted. It does not alter target records.

## Assignment Item semantics

`addAssignmentItem` requires a client-generated `assignmentItemId`.

Adding an assignment item requires:

- assignment belongs to actor organization
- assignment is not soft-deleted
- target type is in the assignment item allowlist
- target belongs to the same organization
- target is not soft-deleted
- target is actionable for new assignment items

For new assignment items:

- trap targets must be active
- habitat targets must be active
- service request targets must not be closed

Existing assignment items remain if a target is later retired or closed.

`addAssignmentItem` accepts optional placement:

```ts
placement?:
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; assignmentItemId: string }
  | { kind: 'after'; assignmentItemId: string }
```

When placement is omitted, default to `{ kind: 'end' }`.

`updateAssignmentItem` edits only `directionsToNextItem`. Changing the target
entity is semantically remove old assignment item plus add a new assignment
item.

`directionsToNextItem` belongs to the item being departed from. It describes
how to get from that stop to the next active stop in assignment order. The last
active item may have `null`. When items move, directions stay attached to their
item unless explicitly edited.

`removeAssignmentItem` soft-deletes only the selected assignment item. It does
not touch the target trap, habitat, or service request, and it does not touch
any source route item.

## Assignment Item movement

Assignment item ordering uses the same fractional `position` strategy and move
semantics as route items.

`moveAssignmentItems` supports moving one or more selected stops as a group.

Payload shape:

```ts
{
  assignmentId: string;
  assignmentItemIds: string[];
  placement:
    | { kind: 'start' }
    | { kind: 'end' }
    | { kind: 'before'; assignmentItemId: string }
    | { kind: 'after'; assignmentItemId: string };
}
```

Server handlers should resolve active assignment items, sort selected items by
their current `position`, remove them from the active assignment sequence, then
insert the group at the requested placement. The selected items' relative
assignment order is preserved regardless of the order of ids in the payload.

For `before` and `after` placements, the anchor assignment item must be an
active item in the same assignment after the selected items are removed from the
sequence. Reject anchors that are themselves selected.

`moveAssignmentItems` should update only the moved items' positions.
`removeAssignmentItem` should not renumber remaining active items.
`addAssignmentItem` should assign only the new item's position. UI stop numbers
are derived at read time by sorting active items by `position`; stored positions
do not need to be contiguous integers.

If a move or add cannot safely fit positions between neighboring active items
because of numeric precision exhaustion, the server may normalize active
assignment item positions internally inside the same transaction, then apply the
requested change. No public v1 normalization command is required.

## Assignment Item progress

Assignment items have first-class progress in v1, and that progress is linked
to the record that produced it. See ADR 0012.

An assignment item names a place someone was sent. The record they made there
carries the stop's id, so a completed stop can say what completed it and an
inspection can say which stop produced it:

- `inspections.assignment_item_id`
- `collections.set_assignment_item_id`
- `collections.collected_assignment_item_id`

`collections` carries two because setting and emptying a trap are separate
visits, routinely on separate days and therefore separate assignments. One
column would let the collect visit overwrite the set visit's provenance.

Service request stops have no such link, because there is no single record a
service request visit produces. They stay UI-orchestrated until there is one.

Schema backlog for `assignment_items`:

- `completed_at timestamptz`
- `completed_by_profile_id uuid references profiles(id) on delete set null`
- `skipped_at timestamptz`
- `skipped_by_profile_id uuid references profiles(id) on delete set null`
- `skip_reason text`

Assignment item progress state is derived from timestamps:

- `pending`: no completed or skipped timestamp
- `completed`: `completed_at` is set
- `skipped`: `skipped_at` is set

Completed and skipped are mutually exclusive.

Commands:

- `completeAssignmentItem`
- `reopenAssignmentItem`
- `skipAssignmentItem`
- `unskipAssignmentItem`

Assignment item progress commands require the parent assignment to be started
and not completed, cancelled, or deleted.

`completeAssignmentItem` marks the planned stop handled. It may accept
`completedAt`, defaulting to server time when omitted. It should reject when the
item is currently skipped; use `unskipAssignmentItem` first.

`skipAssignmentItem` marks the planned stop intentionally skipped. It may accept
`skippedAt`, defaulting to server time when omitted. It requires a non-empty
trimmed `skipReason`. Store the reason as plain text; the UI may provide
convenience quick entries such as "No access", "Weather", "Unsafe",
"Already serviced", or "Could not locate", plus custom text. Do not add a
skip-reason enum or lookup table in v1.

`reopenAssignmentItem` requires the item to be currently completed and clears
completed fields.

`unskipAssignmentItem` requires the item to be currently skipped and clears
skipped fields and reason.

Server handlers should reject future item progress timestamps beyond a small
clock-skew allowance and require progress timestamps to be on or after
`assignments.started_at`.

Both are enforced. The "on or after `started_at`" comparison carries the same
`CLOCK_SKEW_TOLERANCE_MS` allowance as the future check, and for the same
reason: `started_at` is stamped by the server while progress timestamps come
from the device, so a strict comparison would refuse ordinary work from a phone
a minute behind. One allowance rather than two, because it is one fact about
consumer clocks.

The rule applies only to a timestamp the command actually carries.
`reopenAssignmentItem` and `unskipAssignmentItem` clear a progress timestamp
rather than setting one, and a command that omits its timestamp is stamped
server-side, so neither is compared. Refused progress answers
`assignment_item_progress_before_start`, after the item's state rules. A
skipped stop being completed is told to unskip first, whatever its clock says.

`completeAssignment` requires:

- assignment is started
- assignment has at least one active item
- every active assignment item is completed or skipped

Completing or skipping all items does not automatically complete the assignment.
The UI may prompt the user to complete the assignment when all active items are
handled.

## Assignment Item execution

Recording the work a stop was created for is **one command**, not two. The
record and the completion are written in the same transaction, so there is no
state where the work exists and the stop is still pending:

- habitat item: `fieldWork.recordHabitatInspectionForAssignmentItem`
- trap item, setting: `fieldWork.setTrapCollectionForAssignmentItem`
- trap item, emptying: `fieldWork.collectTrapCollectionForAssignmentItem`
- trap item, both in one visit:
  `fieldWork.recordCollectedTrapCollectionForAssignmentItem`

These are `fieldWork.*` rather than `larvalSurveillance.*`/`adultSurveillance.*`
for the reason the mission helpers are `missionDispatch.*`: what makes them a
unit is the assignment lifecycle, not the record. Field validation is shared
through `packages/domain/src/surveillance-records.ts` so neither domain imports
the other. It is the same seam `performed-control-actions.ts` provides for
control actions.

They are reached through the record's own endpoint (`POST
/larval-surveillance/inspections`, `POST /adult-surveillance/collections`,
`POST /adult-surveillance/collections/:id/collect`) by including
`assignmentItemId` in the body. The endpoint follows the table; the command
follows the unit of work. A body without `assignmentItemId` builds the ordinary
surveillance command, unchanged.

Options, matching `MissionExecutionOptions`:

- `completeAssignmentItem`, default **true**
- `autoStartAssignment`, default **true**: a technician who records the first
  stop of the day has started the assignment by doing so
- `acknowledgedCompletedItemAdditionalRecord`: required to add a second record
  to an already-completed stop, because the ordinary cause is a double submit
- `acknowledgedTargetMismatch`: required when the record's target is not the
  one the stop names. A wrong *type* (a collection against a habitat stop) is
  always refused; a different trap is only acknowledged.

The two acknowledgements are answers to a refusal, not options a form offers up
front: the conditions are only knowable once the server has the row, so the
write goes out plain, is refused, and the client re-sends the same write with
the matching flag if the technician confirms. Both refusals are the settled
`409 acknowledgement_required` body, which names the flag itself
(`apps/server/src/acknowledgements.ts`). The completed-stop one counts the
records already filed against the stop and carries them in `consequences`; the
mismatch one counts nothing, so `consequences` is empty and `message` is the
whole answer. A withheld flag is an explicit `false`: an absent one reads as
confirmed, which is the workspace-wide `acknowledged()` rule and why the guards
are held by integration tests rather than by a form (#319).

The flags travel as TanStack DB mutation metadata rather than as row columns,
because they are not properties of the record, and
`apps/web/src/lib/stop-acknowledgements.ts` is what says which questions a
surface may be asked. The refusals with no flag
(`assignment_item_wrong_target_type`, `assignment_item_skipped`) are absent from
it on purpose.

Server checks, in `apps/server/src/field-work-commands/assignment-lifecycle.ts`:
the assignment row is locked before it is read, so two devices cannot both
decide it was unstarted and both stamp a start time. A skipped stop is refused,
and has to be unskipped first. A `completedAt` before the assignment's `started_at` is refused
(`assignment_item_progress_before_start`) exactly as it is for the progress
commands, within `CLOCK_SKEW_TOLERANCE_MS` because the two timestamps come from
different clocks; the rule stands down on the auto-start path, where the start
is being stamped by this very command, and when `completeAssignmentItem` is
false and no completion is being written.

Service request items have no execution command. Record the follow-up, then send
`fieldWork.completeAssignmentItem`; if the follow-up succeeds and completion
fails, the UI should show that the work was recorded but the stop remains
pending, and allow retrying.

`fieldWork.completeAssignmentItem` remains for correction and for stops with no
record to point at.

## Assignment permissions

Assignment planning and editing is manager-and-above:

- create arbitrary assignments
- create assignments from routes for any assignee
- update assignment details
- add, remove, move, and update assignment items
- cancel assignments
- reopen assignments
- delete assignments

Collector-and-above may create an assignment for themselves from an existing
route for today only, resolved in the organization timezone. Collector
self-assignment from a route creates a not-started assignment. It sets
`assigned_to_profile_id` and `assigned_by_profile_id` to the actor profile.

Assigned collectors may start and complete their own assignments. Manager-and-
above may start or complete any assignment for correction/backfill.

Assigned collectors may complete, reopen, skip, and unskip items only on
assignments assigned to their profile. Manager-and-above may complete, reopen,
skip, or unskip any assignment item for correction.

Collectors cannot create arbitrary blank assignments, assign work to other
profiles, or edit assignment item lists in v1.

## Assignment lifecycle interactions

Retiring a trap or habitat leaves existing assignment items unchanged because
assignments are snapshots.

Deleting a trap or habitat should soft-delete direct assignment items targeting
it only when the delete operation is for erroneous data and acknowledges
assignment cleanup; otherwise block or require acknowledgement.

Closing a service request leaves existing assignment items unchanged. Deleting a
service request soft-deletes direct assignment items with acknowledgement.

Deleting an assignment soft-deletes its active assignment items.

Route edits and route deletion never affect existing assignment items.

Assignment item removal never affects target records or route items.

## Assignment loading and offline behavior

Assignments and active assignment items should be part of baseline organization
sync because they are core operational data.

Initial sync may include active, non-deleted assignments and active assignment
items for the organization. Historical completed/cancelled assignments may need
a date-window shape later if volume grows.

Assignment commands should support command-shaped offline replay technically:

- client-generated `assignmentId`
- client-generated `assignmentItemId`
- client-supplied lifecycle/progress timestamps where relevant
- server revalidation on replay
- visible command failure on conflict

Server handlers remain the source of truth and revalidate assignment existence,
organization ownership, permissions, assignee state, target state, placement
anchors, lifecycle state, item progress state, uniqueness, and command
invariants when queued commands replay.

## Assignment schema

`assignment_items` carries the item progress fields:

```sql
completed_at timestamptz
completed_by_profile_id uuid references profiles(id) on delete set null
skipped_at timestamptz
skipped_by_profile_id uuid references profiles(id) on delete set null
skip_reason text
```

Completed and skipped are mutually exclusive in the database, not only in the
handlers:

```sql
alter table assignment_items
  add constraint assignment_items_progress_exclusive
  check (completed_at is null or skipped_at is null);
```

`assignment_items.position` is `double precision`, so reordering writes only the
rows that moved. Assignments stay mixed-type: there is no `assignment_type`
column and v1 does not want one.

**Still open:** `assignment_items.entity_type` is `text`, with no enum or check
constraint.

## Cross-domain lifecycle registry

The shared field-work/support target registry should define lifecycle policy
per target type and support association type.

For each domain target, the registry should answer how lifecycle operations
affect:

- comments
- tag items
- additional personnel
- route items
- assignment items

Possible policies include:

- cascade soft-delete
- preserve
- re-point
- re-point with dedupe
- block unless explicitly acknowledged
- not applicable

Adult, larval, control, route, assignment, mission, contact, address, and GIS
command handlers should use the registry instead of hand-rolling polymorphic
support cleanup.

## Trap lifecycle interactions

Trap retirement:

- sets `traps.is_active = false`
- blocks when pending collections exist, per adult surveillance rules
- soft-deletes active route items targeting the trap, with acknowledgement when
  any route items will be removed
- preserves assignment items targeting the trap because assignments are
  snapshots
- preserves direct trap comments
- preserves direct trap tag items
- blocks new route items and assignment items for the retired trap
- does not restore route items automatically on reactivation

Trap deletion:

- soft-deletes direct trap comments
- soft-deletes direct trap tag items
- soft-deletes active route items targeting the trap
- soft-deletes active assignment items targeting the trap only with explicit
  assignment cleanup acknowledgement
- blocks when active assignment items exist and acknowledgement is missing
- cascades child collection deletion according to adult surveillance delete
  rules when collection deletion is acknowledged
- does not hard-delete anything

## Collection lifecycle interactions

Collection deletion:

- soft-deletes direct collection comments
- soft-deletes direct collection additional personnel
- does not handle tag items because collections are not taggable in v1
- does not handle route items because collections are not route targets
- does not handle assignment items because collections are not assignment item
  targets in v1
- handles collection species rows according to adult surveillance delete rules

Cancelling a pending collection soft-deletes collection support rows when the
collection row itself is soft-deleted.

## Habitat lifecycle interactions

Habitat retirement:

- sets `habitats.is_active = false`
- soft-deletes active route items targeting the habitat, with acknowledgement
  when any route items will be removed
- preserves assignment items targeting the habitat because assignments are
  snapshots
- preserves direct habitat comments
- preserves direct habitat tag items
- does not handle additional personnel because habitats are not
  additional-personnel targets in v1
- blocks new route items and assignment items for the retired habitat
- does not restore route items automatically on reactivation

Habitat deletion:

- soft-deletes direct habitat comments
- soft-deletes direct habitat tag items
- soft-deletes active route items targeting the habitat
- soft-deletes active assignment items targeting the habitat only with explicit
  assignment cleanup acknowledgement
- blocks when active assignment items exist and acknowledgement is missing
- preserves and detaches inspections according to larval surveillance delete
  rules when inspection detach is acknowledged
- keeps inspection and sample support rows when those records survive
- handles cross-domain detaches with their own acknowledgement

Habitat deletion should use a distinct assignment cleanup acknowledgement rather
than hiding assignment cleanup under inspection detach or cross-domain detach.

Habitat merge:

- re-points direct source-habitat comments to the target habitat
- re-points and dedupes source-habitat tag items to the target habitat
- re-points and dedupes source-habitat route items to the target habitat
- re-points and dedupes source-habitat assignment items to the target habitat
- preserves assignment item progress fields when re-pointing
- keeps the existing target assignment item or route item when a duplicate
  target already exists in the same assignment or route
- soft-deletes duplicate source items
- preserves inspection snapshot fields
- soft-deletes source habitats after references move

## Inspection and sample lifecycle interactions

Inspection deletion:

- soft-deletes direct inspection comments
- soft-deletes direct inspection additional personnel
- does not handle tag items because inspections are not taggable in v1
- does not handle route items because inspections are not route targets
- does not handle assignment items because inspections are not assignment item
  targets in v1
- soft-deletes sample comments only when samples are also soft-deleted
- preserves cross-domain records by nulling `inspection_id` where schema allows,
  according to larval surveillance delete rules

Sample deletion:

- soft-deletes direct sample comments
- does not handle tag items because samples are not taggable in v1
- does not handle additional personnel because samples are not
  additional-personnel targets in v1
- does not handle route items
- does not handle assignment items
- handles sample species rows according to larval surveillance delete rules

## Service Request lifecycle interactions

Service request closure is normal lifecycle and does not remove comments, tags,
or assignment items.

Service request deletion:

- soft-deletes direct service request comments
- soft-deletes direct service request tag items
- soft-deletes active assignment items targeting the service request only with
  explicit assignment cleanup acknowledgement
- blocks when active assignment items exist and acknowledgement is missing
- does not handle additional personnel in v1
- does not handle route items

## Address, Region, and Contact lifecycle interactions

Address deletion:

- blocks while any non-deleted domain record references the address
- soft-deletes direct address comments only after reference checks pass
- soft-deletes direct address tag items only after reference checks pass
- does not automatically null, cascade, or rewrite address references

Address reference checks should include non-deleted records such as:

- traps
- collections
- habitats
- inspections
- applications
- source reductions
- outreach actions
- biocontrol actions
- service requests
- notification registrations
- mission items

Retired, inactive, closed, or completed records still count as address
references because they preserve historical context. If force-detach address
workflows become necessary later, they should be explicit manager workflows with
acknowledgements.

Region deletion:

- soft-deletes direct region comments
- soft-deletes direct region tag items
- does not block on notification registrations or operational records in the
  current schema because they own geometry snapshots and do not reference
  `region_id`

Contact deletion:

- soft-deletes direct contact comments
- soft-deletes direct contact tag items
- blocks while any non-deleted service request references the contact
- blocks while any non-deleted notification registration references the contact
- blocks while any non-deleted mission notification references the contact
- does not automatically null or cascade service requests or notification
  records

## Route and Assignment lifecycle interactions

Route deletion:

- soft-deletes direct route comments
- soft-deletes active route items
- requires acknowledgement when active route items exist
- leaves assignments and assignment items unchanged
- does not handle tags or additional personnel in v1

Assignment deletion:

- soft-deletes direct assignment comments
- soft-deletes active assignment items
- requires acknowledgement when active assignment items exist
- does not alter target records
- does not alter route records or route items
- does not handle tags or additional personnel in v1

Assignment item removal never affects target records or route items.

## Control and Mission lifecycle boundaries

For each control action target:

- `application`
- `sourceReduction`
- `outreachAction`
- `biocontrolAction`

Deletion should:

- soft-delete direct comments
- soft-delete direct additional personnel
- not handle tag items in v1
- not handle route items
- not handle assignment items in v1
- preserve or handle links to requested control actions, inspections, habitats,
  collections, and other records according to control-domain detach rules

Requested control action deletion:

- soft-deletes direct requested control action comments
- does not handle tag items, additional personnel, route items, or assignment
  items in v1
- should block or require explicit control/mission-domain acknowledgement if
  applications, source reductions, outreach actions, biocontrol actions, mission
  items, or other records reference it

Mission deletion:

- soft-deletes direct mission comments
- soft-deletes active mission items with mission-domain acknowledgements when
  required
- soft-deletes mission notifications with mission-domain acknowledgement when
  generated notifications exist
- detaches actual control actions from mission items with mission-domain
  acknowledgement when linked actions exist
- does not handle tags, additional personnel, routes, or assignments in v1

## Consolidated schema state

These schema changes surfaced while hardening the field-work and support command
domain. All of them landed in
`202605110001_field_work_support_domain_updates.sql`, and the state below was
read back from the database on 2026-08-19.

Comments:

- `comments.organization_id` is derived denormalized data and stays
- `comments_entity_idx` exists and stays
- `comments_pinned_idx` is dropped

Tags:

- `tag_items.organization_id` exists as derived denormalized data
- `tags_organization_normalized_name_unique` replaced the case-sensitive index

Routes:

- `routes_organization_normalized_name_unique` replaced the case-sensitive index
- `route_items.position` is `double precision` for minimal-write reordering

Assignments:

- assignments stay mixed-type; there is no `assignment_type` column
- `assignment_items` carries `completed_at`, `completed_by_profile_id`,
  `skipped_at`, `skipped_by_profile_id`, and `skip_reason`
- `assignment_items_progress_exclusive` enforces that completed and skipped
  cannot both be set
- `assignment_items.position` is `double precision` for minimal-write reordering

Additional personnel:

- `additional_personnel.organization_id` is derived denormalized data and stays

Command payload follow-ups, all built:

- trap deletion takes `acknowledgedCascadeDelete`, and habitat deletion takes
  `acknowledgedHabitatDelete`, distinct from `acknowledgedInspectionDetach` and
  `acknowledgedCrossDomainDetach`
- assignment and route item cleanup take `acknowledgedAssignmentItemDeletion`
  and `acknowledgedRouteItemDeletion`
- the support-target allowlists live in
  `packages/domain/src/field-work/shared.ts` and the command handlers read them
  from there

The one thing still deferred is the database half of the target registry. All
five `entity_type` columns are `text`, with no enum, check constraint, or
registry-backed migration behind them. `packages/domain` is the only place the
allowed values are written down, and `toDbEntityType` bridges the camelCase
domain names to the snake_case the columns store.

## Domain module shape

Field-work/support commands follow `docs/domain-command-contract.md` and live
behind this public domain seam:

- `packages/domain/src/field-work/`

The top-level file is the public seam. Its current implementation lives behind
`packages/domain/src/field-work/index.ts` so future comments, tags, route, and
assignment splits can stay inside the field-work domain folder without changing
caller imports.

The public seam exports:

- `FieldWorkCommandType`
- `FieldWorkCommand`
- command payload/input types
- command builder functions for comments, tags, additional personnel, routes,
  and assignments
- shared support target types
- shared placement types

Reuse shared domain concepts such as:

- `DomainId`
- `LocalDateString`
- `JsonObject`
- `DomainValidationIssue`
- `DomainValidationError`

Every command payload should include command context:

- `organizationId`
- `actorProfileId`

The server still treats `AuthContext` as authoritative and verifies command
context matches it, as described in the shared contract.

## Domain target types

The domain module should define support-specific target unions.

Comment target types:

```ts
export type CommentTargetType =
  | 'address'
  | 'region'
  | 'trap'
  | 'collection'
  | 'habitat'
  | 'inspection'
  | 'sample'
  | 'application'
  | 'sourceReduction'
  | 'outreachAction'
  | 'biocontrolAction'
  | 'contact'
  | 'serviceRequest'
  | 'route'
  | 'assignment'
  | 'requestedControlAction'
  | 'mission';
```

Tag target types:

```ts
export type TagTargetType =
  | 'address'
  | 'region'
  | 'trap'
  | 'habitat'
  | 'contact'
  | 'serviceRequest';
```

Additional personnel target types:

```ts
export type AdditionalPersonnelTargetType =
  | 'inspection'
  | 'collection'
  | 'application'
  | 'sourceReduction'
  | 'outreachAction'
  | 'biocontrolAction';
```

Route and assignment item target types:

```ts
export type RouteItemTargetType = 'trap' | 'habitat';

export type AssignmentItemTargetType =
  | 'trap'
  | 'habitat'
  | 'serviceRequest';
```

Commands should use nested target objects instead of flat target fields:

```ts
target: {
  type: 'habitat';
  id: string;
}
```

Pure domain builders validate target type strings against the appropriate
allowlist. They do not convert domain target strings to SQL table names.

Server-side target registries map domain target strings to SQL tables and own
organization/lifecycle/reference resolution.

## Domain validation boundary

Use the shared validation boundary in `docs/domain-command-contract.md`.
Field-work-specific builder checks include target allowlists, custom hex color
format, route/assignment placement shape, non-empty arrays, no future
timestamps where appropriate, and mutual exclusivity inside command payloads.

Field-work-specific server checks include target ownership and lifecycle,
duplicate tag/route names, duplicate route/assignment associations, profile
active state, 30-day comment correction windows, acknowledgement requirements,
and cross-domain lifecycle cascades, preserves, and re-points.

## Domain update semantics

Use patch semantics for detail updates:

- `updateTag`
- `updateRouteDetails`
- `updateRouteItem`
- `updateAssignmentDetails`
- `updateAssignmentItem`

Require at least one field in every patch command.

For nullable text/nullable fields:

- `undefined` means no change
- `null` means clear
- non-empty string means set the trimmed value

For non-nullable fields such as comment text, tag name, route name, and skip
reason, trim and reject empty text.

## Domain IDs and dates

Require client-generated IDs for commands that create rows:

- `commentId`
- `tagId`
- `tagItemId`
- `additionalPersonnelId`
- `routeId`
- `routeItemId`
- `assignmentId`
- `assignmentItemId`

Date-only fields use `LocalDateString` because they represent agency-local
calendar dates, not instants:

- `assignmentDate`

Timestamp fields use `Date` objects, matching adult surveillance command style:

- `commentedAt`
- `dueAt`
- `startedAt`
- `completedAt`
- `cancelledAt`
- `skippedAt`

## Domain Route payloads

`createRoute` requires:

- `routeId`
- `routeName`
- `routeType`

`addRouteItem` requires:

- `routeItemId`
- `routeId`
- nested `target`
- optional placement, defaulting to end

Route placement:

```ts
export type RouteItemPlacement =
  | { readonly kind: 'start' }
  | { readonly kind: 'end' }
  | { readonly kind: 'before'; readonly routeItemId: DomainId }
  | { readonly kind: 'after'; readonly routeItemId: DomainId };
```

`moveRouteItems` requires:

- `routeId`
- non-empty `routeItemIds`
- placement

The domain builder should reject duplicate route item ids in the payload.

## Domain Assignment payloads

`createAssignment` requires:

- `assignmentId`
- `assignmentDate`

It may accept:

- `assignmentName`
- `assignedToProfileId`
- `dueAt`

`createAssignmentFromRoute` is the manager+ planning command. It requires:

- `assignmentId`
- `routeId`
- `assignmentDate`
- optional `assignedToProfileId`
- generated assignment item ids mapped to route item ids

Mapping shape:

```ts
assignmentItemIds: readonly {
  readonly routeItemId: DomainId;
  readonly assignmentItemId: DomainId;
}[];
```

The domain builder should reject duplicate route item ids and duplicate
assignment item ids in the mapping. The server verifies that the route item ids
are active items in the route and copies target/order/directions from those
route items.

`selfAssignRoute` is the collector+ route self-assignment command. It is
separate from `createAssignmentFromRoute` because permissions and date semantics
differ. It requires:

- `assignmentId`
- `routeId`
- generated assignment item ids mapped to route item ids

It does not accept `assignmentDate`. The server resolves today in the
organization timezone and sets:

- `assignment_date`
- `assigned_to_profile_id = actorProfileId`
- `assigned_by_profile_id = actorProfileId`

`addAssignmentItem` requires:

- `assignmentItemId`
- `assignmentId`
- nested `target`
- optional placement, defaulting to end

Assignment item placement:

```ts
export type AssignmentItemPlacement =
  | { readonly kind: 'start' }
  | { readonly kind: 'end' }
  | { readonly kind: 'before'; readonly assignmentItemId: DomainId }
  | { readonly kind: 'after'; readonly assignmentItemId: DomainId };
```

`moveAssignmentItems` requires:

- `assignmentId`
- non-empty `assignmentItemIds`
- placement

The domain builder should reject duplicate assignment item ids in the payload.

Assignment item progress commands operate by `assignmentItemId` only:

- `completeAssignmentItem`
- `reopenAssignmentItem`
- `skipAssignmentItem`
- `unskipAssignmentItem`

`completeAssignmentItem` may accept `completedAt`. It does not include a note,
comment, or completion evidence reference.

`skipAssignmentItem` requires `skipReason` and may accept `skippedAt`. It does
not include a comment. The UI may create comments separately when richer context
is needed.
