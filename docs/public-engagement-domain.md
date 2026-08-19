# Public engagement domain decisions

Shared command, validation, offline, sync, location-source, and module-shape
rules live in `docs/domain-command-contract.md`. This file records public
engagement vocabulary and exceptions.

This captures the public engagement command decisions from the domain interview.
These commands harden contacts, service requests, notification registrations,
notification types, and mission notification tracking. Server endpoints, public
portal intake, sync shapes, imports, and real notification sending remain
deferred.

## Command shape

Public engagement commands live behind a framework-agnostic public domain seam:

- `packages/domain/src/public-engagement/`

The public seam re-exports implementation modules under
`packages/domain/src/public-engagement/`:

- `contacts.ts`
- `service-requests.ts`
- `notification-types.ts`
- `registrations.ts`
- `mission-notifications.ts`
- `core.ts` for shared command context, contact/address/location normalizers,
  and notification registration helpers

Commands use the `publicEngagement.*` namespace and carry agency command
context:

- `organizationId`
- `actorProfileId`

Server `AuthContext` remains authoritative and verifies both IDs. SIMMER
operator support tooling and future public portal intake use separate workflows,
not these agency commands.

Client-generated IDs are required wherever the client creates a durable row.
The main exception is `generateMissionNotifications`, where the server derives a
set of mission notification rows from current mission, registration, contact,
and spatial state.

## Contacts

Contact commands:

- `publicEngagement.createContact`
- `publicEngagement.updateContactDetails`
- `publicEngagement.updateContactCommunication`
- `publicEngagement.mergeContacts`
- `publicEngagement.deleteContact`

Contact management is manager-and-above. Collectors may view contacts and use
shared comment/tag commands where those support workflows allow it. Viewers are
read-only.

Contacts are durable agency-owned public-person or public-organization records.
Create requires at least one broad identity field after trimming:

- `contactName`
- `company`
- `preferredPhone`
- `alternatePhone`
- `email`

`company` alone is valid. `department` and `title` are supporting fields and do
not satisfy identity by themselves. Contact email is not unique; duplicates are
warning-only.

Phone values are permissive text. Commands trim phone fields, normalize empty
strings to `null`, and enforce only structural rules:

- `alternatePhone` is backup/informational only
- `alternatePhone` may not exist without `preferredPhone`
- `wantsSms` and `wantsPhone` require `preferredPhone`

Official clients should use `libphonenumber-js` to encourage clean data, but
commands and database constraints do not enforce phone format. `wantsEmail`
requires `email`. Notification preference booleans default to `false`. V1 does
not store consent timestamp/source fields.

SIMMER v1 does not model fax. Remove `contacts.fax`, remove `fax` from
notification channels, and do not expose fax commands.

`updateContactDetails` edits identity/context fields:

- `contactName`
- `company`
- `department`
- `title`

`updateContactCommunication` edits:

- `preferredPhone`
- `alternatePhone`
- `email`
- `wantsEmail`
- `wantsSms`
- `wantsPhone`

Patch builders validate context-free shape. Server handlers validate the final
stored contact still has at least one broad identity field and that final
communication preferences are possible.

Contact deletion is soft delete and idempotent when safely resolvable. It is
blocked while any non-deleted service request, notification registration, or
mission notification references the contact. It soft-deletes direct contact
comments and tags after reference checks pass.

`mergeContacts` is manager-and-above, always requires acknowledgement, requires
same-organization non-deleted source contacts, and accepts one or more unique
source contact IDs. The target contact's details and communication preferences
win. Merge re-points service requests and notification registrations from source
contacts to the target, moves direct source contact comments to the target, and
moves/deduplicates direct source contact tag assignments. Historical
`mission_notifications.contact_id` values are not rewritten; they remain
snapshots of the contact used when the mission notification was generated.

## Service Requests

Service request commands:

- `publicEngagement.createServiceRequest`
- `publicEngagement.updateServiceRequestDetails`
- `publicEngagement.updateServiceRequestContact`
- `publicEngagement.updateServiceRequestLocation`
- `publicEngagement.closeServiceRequest`
- `publicEngagement.reopenServiceRequest`
- `publicEngagement.deleteServiceRequest`

Service request management is manager-and-above. Collectors may comment, tag,
and work assignment items according to the shared field-work domain, but they
cannot create, edit, close, reopen, or delete service requests.

Persisted lifecycle is intentionally simple:

- open: `closed_at is null`
- closed: `closed_at is not null`
- deleted: soft-deleted row

Do not add a service request status enum, priority, due date, resolution
category, merge command, contact snapshot columns, or direct
`service_request_id` links on operational records in v1. Tags, comments,
assignments, requested control actions, missions, control records, and
proximity/time-window views carry richer workflow context.

`display_name` is a server-assigned, stable, organization-scoped request
number. It is not part of normal command payloads and should not be recycled
after deletion.

Service requests are address-backed and geometry-backed. Commands carry a
Point-only GeoJSON `geometry`; the server stores that geometry directly on the
request row. The request geometry is independent from the address geometry and
does not follow later address location changes. Create and location update
commands require complete location intent: address selection/creation plus
request geometry.

`createServiceRequest` can create a contact and/or address inline. Inline
creates use nested detail objects, not nested command envelopes. Inline contact
details use the same validation as standalone contact creation. Inline address
details use the same foundation address semantics, including Point geometry,
US-only address normalization, and optional `geocoderResponse`.

Request intake types are:

- `online`
- `phone`
- `walk-in`
- `other`

Agency commands require explicit `requestDate` and `intakeType`; UI may default
`intakeType` to `online`. `requestDate` is a `LocalDateString`. Pure builders
validate date shape and real calendar dates. Server handlers enforce non-future
dates in the organization timezone.

`receivedByProfileId` defaults to the actor when omitted. Explicit `null` is
allowed for unknown or backfilled external/online-origin requests. Non-null
values must be active same-organization profiles.

`details` is required, non-empty text. Do not invent placeholder text such as
"No details provided."

`updateServiceRequestDetails` edits:

- `requestDate`
- `intakeType`
- `receivedByProfileId`
- `details`

Closed request detail edits require `acknowledgedClosedRequestChange`.

`updateServiceRequestContact` and `updateServiceRequestLocation` are separate
commands. Each supports existing or inline new contact/address where relevant.
Changing contact or location requires acknowledgement when the request is closed
or already has comments, tags, or assignment items. Clean open request
corrections do not require acknowledgement.

`closeServiceRequest` requires:

- `resolutionCommentId`
- `resolutionSummary`
- optional `closedAt`

It rejects already-closed requests, sets `closed_by_profile_id` to the actor,
and creates a normal unpinned service request comment in the same transaction.
When omitted, `closedAt` defaults server-side. The resolution comment uses the
chosen closure timestamp as comment provenance.

`reopenServiceRequest` requires:

- `reopenCommentId`
- `reopenReason`
- optional `reopenedAt`

It rejects open requests, clears closure fields, and creates a normal unpinned
service request comment. There is no `reopened_at` column in v1.

`deleteServiceRequest` is manager-and-above, soft-deletes direct service request
comments and tag assignments, and does not touch the contact. Deleting a closed
request requires `acknowledgedClosedRequestDeletion`. Active assignment item
cleanup requires `acknowledgedAssignmentItemDeletion`. Delete does not require a
reason.

## Notification Types

Notification type commands:

- `publicEngagement.createNotificationType`
- `publicEngagement.updateNotificationType`
- `publicEngagement.deactivateNotificationType`
- `publicEngagement.reactivateNotificationType`
- `publicEngagement.deleteNotificationType`

Notification type catalog management is owner/admin only.

Names are required and unique per organization after trimming and case folding,
excluding soft-deleted rows. Description is optional and clearable. New types
default active.

Changing a referenced notification type name requires
`acknowledgedHistoricalLabelChange`. Description-only edits do not require
acknowledgement. Deactivation is idempotent and requires acknowledgement when
active registrations subscribe to the type. Deactivation is blocked when active
or scheduled missions use the type; completed/cancelled mission history may
retain inactive types. Deletion is soft delete and allowed only when the type is
unreferenced by subscriptions, missions, and mission notifications.

## Notification Registrations

Notification registration commands:

- `publicEngagement.createNotificationRegistration`
- `publicEngagement.updateNotificationRegistrationContact`
- `publicEngagement.updateNotificationRegistrationLocation`
- `publicEngagement.updateNotificationRegistrationBuffer`
- `publicEngagement.updateNotificationRegistrationFlags`
- `publicEngagement.deactivateNotificationRegistration`
- `publicEngagement.reactivateNotificationRegistration`
- `publicEngagement.deleteNotificationRegistration`
- `publicEngagement.subscribeNotificationRegistrationType`
- `publicEngagement.unsubscribeNotificationRegistrationType`

Notification registration management is manager-and-above.

Registrations always require a contact, including bee/no-spray-only operational
warnings. The contact may be existing or inline new. A registration may use no
address, an existing address, or an inline new address. Registration geometry is
authoritative and supports Point, LineString, and Polygon. Address geometry
remains Point-only.

Buffers apply to all registration geometry types. Buffer distance and unit use
both-or-neither semantics. Buffer distance must be positive when present, and
buffer unit must be a distance unit server-side. `null` buffer means exact
geometry.

`hasBees` and `isNoSpray` are independent operational flags, not notification
type subscriptions. New registrations default both flags to `false` and active
to `true`.

An active or inactive registration must always have at least one purpose:

- at least one non-deleted notification type subscription
- `hasBees = true`
- `isNoSpray = true`

Subscriptions do not require current channel opt-ins or destinations. New
subscriptions require active, non-deleted notification types. Unsubscribing
soft-deletes the subscription row and requires `acknowledgedFutureOnlyChange`
when mission notifications already exist for the registration/type. Resubscribe
restores an existing soft-deleted subscription row for the same
registration/type when present; otherwise it uses the supplied client-generated
subscription ID.

Registration edits are prospective. Existing mission notification rows preserve
their original registration, contact, notification type, channel, destination,
and status. Location, buffer, contact, type subscription, or flag edits require
`acknowledgedFutureOnlyChange` or historical-contact acknowledgement when
mission notifications reference the registration. Deactivation is normal opt-out
and does not require that acknowledgement. Deleting a registration soft-deletes
subscriptions and is blocked if any non-deleted mission notifications reference
it.

Notification registrations, notification types, and mission notifications are
not commentable or taggable in v1. Notes about registrations belong on the
contact record.

## Mission Notifications

Mission notification commands:

- `publicEngagement.generateMissionNotifications`
- `publicEngagement.completeMissionNotification`
- `publicEngagement.failMissionNotification`
- `publicEngagement.skipMissionNotification`
- `publicEngagement.reopenMissionNotification`

Mission notification generation and status management are manager-and-above.
V1 mission notifications are manual tracking/worklist records only. They do not
send email, SMS, or phone notifications and do not integrate with providers.

`generateMissionNotifications` is an explicit mutation command. The server
derives pending mission notification rows from current state. It uses the
mission's stored `notification_type_id`; generated rows snapshot that
notification type. The command does not accept a notification type ID or child
row IDs.

Matching uses active mission item geometries, not service requests or a
mission-level geometry. A registration is eligible when its effective buffered
geometry intersects at least one active mission item, it is active and
non-deleted, its contact is non-deleted, and it has a non-deleted subscription
to the mission's active notification type. Bee/no-spray-only flags do not create
mission notification rows; they are queried separately as operational warnings.

Generation creates one row per mission, registration, and eligible channel even
when multiple mission items intersect. Eligible channels come from current
contact preferences and concrete destinations:

- email: `wantsEmail && email`
- sms: `wantsSms && preferredPhone`
- phone: `wantsPhone && preferredPhone`

Rows are created only when a concrete destination exists. Existing rows are not
mutated by regeneration. A mission with items but zero eligible recipients is a
valid no-op result. Generation is rejected for deleted, completed, cancelled, or
itemless missions.

Mission notification status commands operate by `missionNotificationId` and may
carry optional `statusChangedAt`. They do not require reason fields. Completed
rows must be reopened before moving to failed/skipped/pending. Failed or skipped
rows may move to completed or each other. Reopen sets status back to pending.
Status corrections are allowed regardless of mission lifecycle.

## Permissions

Public engagement agency command permissions:

- owner/admin/manager:
  - manage contacts
  - manage service requests
  - manage notification registrations
  - generate and update mission notifications
- owner/admin:
  - manage notification type catalog
- collector:
  - no public engagement management commands
  - may use shared field-work comment/tag/assignment item workflows when allowed
- viewer:
  - read-only

SIMMER operators do not bypass agency roles through `publicEngagement.*`
commands. If a SIMMER operator is also an agency member, they act through that
agency membership.

## Offline and mobile expectations

Public engagement commands follow `docs/domain-command-contract.md`. Product
usage can still be web-first for manager workflows in v1. Collectors may
interact with assigned service requests through shared field-work comments,
tags, and assignment item commands. Public/mobile intake is deferred.

Detailed Electric/TanStack DB shape and sync decisions for contacts, service
requests, notification registrations, and mission notification worklists are
deferred to a per-app sync design pass.

## Validation boundary

Use the shared validation boundary in `docs/domain-command-contract.md`.
Public-engagement-specific builder checks include email syntax, contact
communication structural invariants, phone trimming without format parsing,
geometry shape, buffer both-or-neither shape, and positive distance.

Public-engagement-specific server checks include final contact identity and
communication state, request lifecycle state, notification registration purpose,
distance-unit compatibility, request date/timestamp checks in organization
timezone, assignment item cleanup, contact merge/delete references,
registration delete references, mission notification generation eligibility,
and spatial matching/buffered intersections.

## Schema changes surfaced

Public engagement schema follow-up covered by
`202605140001_public_engagement_mission_dispatch_domain_updates.sql`:

- remove `contacts.fax`
- remove `fax` from `notification_channel`
- replace/supplement notification type name uniqueness with a normalized
  soft-delete-aware unique index:

```sql
create unique index notification_types_organization_normalized_name_unique
  on notification_types (organization_id, lower(trim(name)))
  where deleted_at is null;
```

Do not add in this pass:

- service request status enum
- service request priority or due date
- service request resolution category
- service request/contact snapshot columns
- `service_request_id` links on operational records
- notification registration merge
- service request merge
- contact active/inactive lifecycle
- derived `organization_id` columns on notification child tables
- public portal fields or consent history tables

## Deferred

- Public-facing portal intake and anti-spam/consent flows.
- Sync/query shape design per app.
- Public engagement imports and metadata-writing admin workflows.
- Server command endpoints.
- Actual notification provider integration and delivery receipts.
- Report/export workflows.
- Search/index tuning beyond normalized notification type uniqueness.
