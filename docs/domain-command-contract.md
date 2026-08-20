# Domain command contract

This contract captures rules shared by SIMMER domain command designs. Load this
file when implementing or reviewing command builders, command handlers, sync
mutation adapters, or offline/mobile replay behavior. Load the specific
`docs/*-domain.md` file only for domain-specific vocabulary and exceptions.

**Every agency write to Postgres is a command.** One model covers every
operation: *this is what I intended to do*, and the server decides whether to do
it. A client never states which tables a write touches, in what order, or
whether a second system is involved. Identity writes, meaning profiles,
memberships, and the agency's own details, are the exception. ADR 0013 decided
they become commands too, but none has moved yet: `apps/server/src/roles.ts`
still holds all seven as REST surfaces with their own floors.

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

Fifty-one tables are served this way, carrying 265 of the 274 names in the
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

## Offline and sync

- Offline queues store domain commands, not DB-shaped patches.
- Read/sync rows may expose database representation details, but commands should
  carry domain concepts.
- Inactive non-deleted lookup rows should remain syncable when historical
  records need labels, but they should not be offered for new selection.
- Detailed Electric/TanStack DB shape policy belongs in `docs/sync.md` unless a
  domain doc records a specific exception.

## Commands that span two systems

Most commands commit in one Kysely transaction. Three identity commands cannot,
because the grant a session is refreshed against lives in WorkOS rather than in
Postgres: inviting somebody, changing a role, and ending a membership. ADR 0013
admits these to the vocabulary under four rules, which apply once the work is
done.

- **Postgres orders the write.** The row is written first on a create and last
  on a revoke. Revoking in Postgres first leaves somebody who reads as removed
  and can still sign in.
- **A client-generated id is what makes the replay safe.** An invitation carries
  the membership id it will create, so a replay collides on the primary key and
  the second system is never called twice. A spanning command without one is not
  replay-safe and must not be built.
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
