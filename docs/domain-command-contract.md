# Domain command contract

This contract captures rules shared by SIMMER domain command designs. Load this
file when implementing or reviewing command builders, command handlers, sync
mutation adapters, or offline/mobile replay behavior. Load the specific
`docs/*-domain.md` file only for domain-specific vocabulary and exceptions.

**Every agency write to Postgres is a command.** One model covers every
operation: *this is what I intended to do*, and the server decides whether to do
it. A client never states which tables a write touches, in what order, or
whether a second system is involved.

Identity is there. ADR 0013 decided that profiles, memberships and the agency's
own details become commands too, and every one of them is: three that touch
Postgres and nothing else, and four on `/commands/memberships` that also settle
WorkOS. One surface is still REST and always will be —
`people.listMemberships`, which is a read behind a POST.

## Command shape

- Domain commands represent user intent, not database patches.
- Commands create durable rows with client-generated UUIDs where the client can
  reasonably know the id before submit.
- Commands carry domain actor ids, operational dates/times, and source ids that
  make offline replay and audit attribution explicit.
- Command payloads should be stable enough for optimistic UI metadata, command
  logs, and future mobile queues.

## Validation boundary

Pure domain command builders validate context-free rules:

- required fields;
- enum/value membership;
- number ranges that do not require database state;
- date and timezone shape;
- mutually exclusive fields inside the command payload;
- normalization of empty strings, optional fields, and derived status helpers.

Server command handlers validate context-dependent rules:

- organization ownership and role authorization;
- referenced rows exist and belong to the authorized organization;
- active/inactive lifecycle rules;
- uniqueness and concurrency checks;
- schema-level constraints and foreign keys;
- source geometry lookup and snapshot behavior.

## The write surface

An agency write goes to one endpoint per table, and the body names the commands
it means.

```
POST   /commands/habitats        { intents: ['larvalSurveillance.createHabitat'], … }
PATCH  /commands/habitats/{id}   { intents: ['larvalSurveillance.updateHabitatDetails'], habitat_name: '…' }
DELETE /commands/habitats/{id}   { intents: ['larvalSurveillance.deleteHabitat'] }
```

Fifty-four tables are served this way, carrying 272 of the 281 names in the
vocabulary. The modules are `apps/server/src/table-commands/`, one per table or
per group of tables written together, and `dispatch.ts` is the mechanism they
share. Both the server and the client derive the path from `commandPathFor` in
`packages/sync`, so a route and the URL a collection posts to cannot drift.

**The decomposition is per table, not per domain, because the table is what the
client has.** A write starts as a mutation on a TanStack DB collection, and a
collection is a table. The domain a command belongs to is in the command's own
name, which the body carries, so the path has no use for it.

**`intents` is a list because one save can mean more than one command.**
Renaming a Habitat and redrawing its geometry is `updateHabitatDetails` and
`updateHabitatLocation`. The client cannot send two writes, because TanStack DB
merges two updates to one key and keeps only the later metadata. So it sends
both names over one payload, each builder reads the fields it takes, and
`runCommands` commits the list in one transaction.

Authorization runs on the names, before any builder does. A role that may not
send a command is refused without its payload being validated, which is what
naming the command in the request buys over inferring it from the fields.

### Declaring a command takes two halves

A `TableCommands` declares its `table`, its `run` config, and an `intents` map
from each command name it accepts to a builder. Adding a command means adding
both halves, and neither half fails usefully on its own:

- A name in no table's `intents` map is unreachable. The route answers 400,
  saying that table does not accept it. That is the mechanism behind the 501
  stubs #163 removed.
- A name in an `intents` map that the domain writer's `switch` does not handle
  is a 500 that names neither half. The builder runs, the write reaches the
  writer, and the writer throws `Unsupported`.

The second gap is invisible to the compiler, so
`tests/unit/table-commands/writer-coverage.test.ts` walks every (table, intent)
pair on the surface and asserts the writer recognizes each one. It found
`missionDispatch.moveMissionItems`, which the `missions` route accepted and
`writeMissionCommand` had never heard of.

### The nine commands that are not on it

Seven are `organizationSettings.*`. They write one row's `settings` JSON
document rather than columns, so there is no column diff to read an intent off
and no row id to dispatch on. Each has its own route, `PATCH
/organization-settings/{aspect}`, gated on its own floor from
`COMMAND_PERMISSIONS`. Do not fold these into the table surface. The dispatch
has nothing to give them.

The other two write more rows than one, and answer with more than one row:

- `weather.commitWeatherSummaryImport` at `POST
  /commands/weather_summaries/import` is station-scoped and answers per-row
  results.
- `publicEngagement.generateMissionNotifications` names a Mission, writes as
  many `mission_notifications` rows as the spatial match turns up, and answers
  with the set.

`runCommands` answers `{ row, txid }`, which is where both of those stop fitting.
A command whose result is a set rather than a row gets its own route for the same
reason.

### Which surface a new command uses

The per-table surface. Always, unless the command is one of the shapes above.

The older per-domain endpoints are still registered, under
`apps/server/src/*-commands/`, and still tested. `POST
/larval-surveillance/habitats` is `createHabitat`, and a PATCH there decides
between five commands by reading which fields arrived. That inference is what
the per-table surface exists to remove: an extra key in a body becomes an extra
command, so the payload's shape is load-bearing in a way nothing states. Both
surfaces call the same writers, the same permission map, and the same
transaction, so a table served by both cannot disagree with itself, but only one
of them lets a client say what it meant.

`apps/web` posts nothing to the older surface. What remains on it is
`apps/admin`, which seeds a new agency's geography and lookups through
`/foundation/*` and `/adult-surveillance/traps`. Do not add to it.

## Column names in a command body

A body's keys are two languages, and the case is what tells them apart.

- **`snake_case` names a column.** Usually a column of the record being
  written.
- **`camelCase` names anything else**: an acknowledgement
  (`acknowledgedRegionDelete`), an instruction (`locationSource`, `geometry`), or
  an argument that becomes a different record (`resolutionCommentId`).

`publicEngagement.closeServiceRequest` reads `payload.closed_at`, a column of the
Service Request, beside `payload.resolutionCommentId`, which becomes a Comment.
The command that records a Habitat Inspection reads `payload.assignment_item_id`
beside `payload.completedAt`, which closes the Assignment Item. Spelling
everything `snake_case` is not available. Of the 277 keys the handlers read, 87
are `camelCase` and have no column to be named after, and inventing one for each
would make them look like columns.

The conversion happens in the builder, and it belongs there. `packages/domain`
must not know the schema, and this is the validation boundary the section above
describes.

A handful of `snake_case` keys are columns of another record. A Mission planned
from a Route arrives with the stops it is made of; an Assignment created from a
Route carries `route_id`. Those stay `snake_case`, because they are column
names and a reader would take a `camelCase` spelling for an instruction. The
module's own "Field names" section says which of its keys are not its columns.

### The check

`pnpm check:command-columns` reads every `snake_case` key an intent handler
reads and requires it to be a column of that handler's table, from the generated
row schema in `packages/sync/src/collections/tables/`. CI runs it beside
`check:build-graph`.

It exists because the client half of this is safe and the server half is not.
A mutation's keys are `withoutServerOwnedColumns(mutation.changes)`, so they come
off the generated row type and cannot be misspelled. A handler types its keys as
string literals against a loose `Record<string, unknown>`, so
`payload.region_folder_ids` compiles, reads `undefined`, and leaves the Region in
no folder while the caller gets a 200.

Two faults, and the second is the one worth having:

1. A typo, at the moment it is written.
2. A column a later migration renames or drops, where the handler keeps reading
   the old name and quietly stops receiving a value.

The reverse direction is not checked. A handler reads only the keys its command
takes, and a column no command writes is normal. Single-word keys are not
checked either, because `name` and `context` are spelled the same and only one
of them is a column. Cross-record keys are listed in the script's
`CROSS_RECORD_KEYS` with what each names, and an entry no handler reads any more
is itself a failure.

## Delete policy

Deleting a record is never just the one row. Each domain doc states, per
deletable record, which rows go with it, which survive with their link cleared,
and which references refuse the delete outright.

That policy lives as data in `packages/db/src/domains/record-deletion.ts`, not
in the handlers. A delete command case calls `applyRecordDeletion` inside its
transaction before soft-deleting its own row; the same registry answers
`GET /records/:recordType/:recordId/delete-impact`, which the detail page's
danger zone reads to state the consequences and to refuse the delete before the
user commits. One source means the warning and the write cannot drift apart.

Adding a deletable record type means adding its rules to that registry, not
hand-rolling cleanup in the handler. A blocked delete answers 409 with the same
entry shape the impact read returns, so a client that raced a new reference can
still name what stopped it.

### Catalogs are block-only

The registry covers the catalogs as well as the operational records, and every
catalog rule is a `block`. None cascades, none detaches. Delete means the record
should never have existed, so a live referrer is proof that it did and the
agency wanted Deactivate. The block reaches catalog children too: an Insecticide
with a Batch needs the Batch deleted first.

Catalog deletes call `assertRecordDeletable` rather than `applyRecordDeletion`,
which is the same check without the cascade and detach writes there is nothing
for them to do. It takes a `DbExecutor`, so the writers in `packages/db` can
call it without being retyped.

The three operator-global catalogs (Unit, Genus, Species) cannot use the
registry, because every query in it scopes by `organization_id` and those rows
have none. Their block counts across every agency, reports one total, and names
no agency. `units` also carries a hand-written check against
`organizations.settings -> 'unitDefaults'`, because that reference is a code
string in a JSON document and a rule that counts rows cannot see it.

### The same question, forwards

A delete asks whether anything refers to a row. A write asks whether it may
refer to one. `packages/db/src/domains/write-references.ts` answers the second
and shares the first's registry, so a catalog gets both directions or neither.

`assertWriteReferences` refuses a write naming a row it may not use. The body is
`{ error: 'reference_refused', reason, reference, message }`, where `reason` is
`missing` or `inactive` and `reference` names the catalog record type or the
table. Missing answers 404 and inactive 409; missing does not distinguish
"another agency's" from "no such row", because telling them apart would make the
refusal a way to probe for ids.

Pass `write: { kind: 'update', table, recordId }` on an update and
`{ kind: 'create' }` on a create. The stored row is read once and any reference
already holding that value is skipped, so only a reference whose value
**changes** is gated and a historical record stays editable after its product
retires. Gating on the payload id without that comparison refuses unchanged
values, and nothing shows it until something is deactivated in production. The
two shapes are a union rather than optional fields for that reason.

Every foreign key pointing at a catalog needs a rule, and
`write-reference-coverage.integration.test.ts` asks the live schema whether one
exists. The registry is a hand-written list and cannot notice what it omits; a
column added by a later `alter table` is invisible to anything reading the
migration text, which is how `missions.notification_type_id` first got missed.

Two catalog references are deliberately not gated, both marked at the site: a
habitat type copied from the Habitat being inspected, and a method the mission
plan supplied. Neither is a new choice.

### A record reference is the same rule, minus `is_active`

A catalog is not the only thing a body names an id in. An Address, a Habitat, an
Inspection, a Profile arrive the same way, and until #200 nothing checked whose
they were: a foreign key is satisfied by the row existing anywhere, so org A
could file a Chemical Application against org B's Equipment and get a 201.

A **record** reference qualifies when the row belongs to the writing agency and
is not soft-deleted. There is no third condition, because there is no
`is_active` on an operational record and no meaning for one.

Writers do not list these. They come off the row being written:

- `checkedValues` wraps an insert's own object,
  `.values(await checkedValues(trx, organizationId, { … }))`, and gates every
  column in it that `RECORD_REFERENCE_COLUMNS` knows.
- `updateRow` runs the same check on the patch, so an update through it is
  covered without a line of its own.

Taking the references from the values rather than from a per-writer list buys
two properties a list cannot have: a reference cannot be forgotten once the
column is being written, and it cannot name a column the table does not have,
which matters because the update path reads the stored value back.

`pnpm check:write-references` asserts every write that names one of those columns
goes through one of the two seams. Its allowlist is for a column set from
`AuthContext` rather than a payload, such as the actor who completed a stop.

The two weather tables are outside all of this. Their `organization_id` is
nullable, kept that way for a provider-owned station, and `organization_id = $1`
compares unequal to null — this gate would read a global station as belonging to
nobody and refuse it. `weather-commands/shared.ts` writes that predicate out
itself.

## Offline and sync

- Offline queues store domain commands, not DB-shaped patches.
- Read/sync rows may expose database representation details, but commands should
  carry domain concepts.
- Inactive non-deleted lookup rows should remain syncable when historical
  records need labels, but they should not be offered for new selection.
- Detailed Electric/TanStack DB shape policy belongs in `docs/sync.md` unless a
  domain doc records a specific exception.

## Commands that span two systems

Most commands commit in one Kysely transaction, including the three identity
commands ADR 0013's first slice moved, which write Postgres and nothing else.
Four others cannot, because the grant a session is refreshed against lives in
WorkOS rather than in Postgres: `identity.invite`, `identity.reinvite`,
`identity.changeRole` and `identity.endMembership`. ADR 0013 admits these to the
vocabulary under seven rules.

All four are on `/commands/memberships`, and what carries the WorkOS half is
`run.secondSystem` on that table alone: a `before` the command runner calls
ahead of the transaction, and an `after` it calls once that has committed. Which
hook a command uses is which side of the write its second system belongs on, so
the ordering rule below is the shape of the code rather than a comment beside
it. Nothing WorkOS-shaped runs inside the transaction.

`identity.reinvite` is both sides at once and sits in `after`, because the
refusal that matters to it is the Postgres one: a Membership that is not holding
an invitation answers 409, and revoking ahead of that would kill a live link for
a command that never happened.

- **Postgres orders the write.** The row is written first on a create and last
  on a revoke. Revoking in Postgres first leaves somebody who reads as removed
  and can still sign in.

- **A client-generated id is what makes a retry safe.** The replay to defend
  against is a retry inside one live request, not an offline queue. Nothing
  queues an identity write offline, `apps/web` is online-only, and `apps/mobile`
  signs in and nothing else. The client mints every id the command creates, so a
  retry that lost its answer collides on the primary key, and the server returns
  the row that is already there instead of calling WorkOS twice. A spanning
  command whose rows are keyed by the server is not retry-safe and must not be
  built. If an identity write ever does queue offline, this rule is the one that
  no longer holds, and the decision is a new one.

- **The natural key refuses a race.** A collision on a minted id is the caller's
  own retry. A collision on a uniqueness rule the schema owns, carrying a
  different id, is two admins asking for the same thing at once, and the server
  refuses it and names who holds it. For an invitation that rule is
  `memberships_organization_invited_email_unique`, which is one live invitation
  per address per agency.

- **An overwrite is its own command.** Where a second call is sometimes a retry
  to swallow and sometimes a deliberate redo, no key can tell them apart.
  `identity.invite` creates and refuses a collision. `identity.reinvite`
  overwrites a Membership that is already invited, revokes the WorkOS invitation
  it replaces, and is reached from the invited row rather than from the invite
  dialog. Splitting them is what lets the minted id mean one thing.

- **Replacing a grant revokes before it issues.** The second system decides
  whether it will hold two of a thing at once, and WorkOS will not: one
  invitation per address per organization, and a send while one is pending is
  refused. `identity.reinvite` sent first and revoked last, which read as the
  safe order and was in fact an order in which the command could never succeed
  (#218), because the only rows the command is offered on are the rows holding an
  invitation. So the revoke goes first.

  What that costs is a window where the person holds no grant at all: the old one
  is gone and the new one has not issued. Nothing closes it. A restore is another
  call that can fail the same way, and the failure it is restoring from is usually
  the second system being unreachable. What is owed instead is two things. The row
  must end saying only what the second system actually finished, which for a
  re-invitation means clearing `workos_invitation_id` the moment the revoke lands,
  so a retry finds nothing to revoke and the Membership never names a dead link.
  And the failure must be legible: one server log line naming the row, the agency
  and the grant that was revoked, because no screen shows the difference between
  "the re-invitation failed" and "the re-invitation failed and took their link
  with it".

- **No optimistic row for the half the client cannot see.** Apply optimistically
  to what the command fully determines; never invent a status only the second
  system decides. Sync reflects the result once both have settled.

- **The domain doc names the second system**, and says what a partial failure
  leaves behind. A half-applied spanning command is an access bug, not a data
  bug, and it will not look like one.

A command that does not span two systems must not be written as though it might.
The rules above are a cost, not a template.

## Location sources

Location-bearing commands carry a domain location source. The source may be
explicit GeoJSON geometry or an allowed same-organization locatable record.
Server handlers store explicit geometry directly on the target row or snapshot
the source record's owned geometry inside the authorized transaction.

Domain docs own the allowed source flows for each workflow.

## Module shape

`packages/domain` should expose stable top-level public seams while allowing
large domains to split implementation internally. Shared primitives belong in
domain-neutral modules only when at least two domains need the same concept.

Domain tests should live near the package's domain tests and cover builders,
normalizers, derived status helpers, and boundary cases that do not require a
database. Server handler and persistence behavior should be tested where the
handler or database layer owns it.
