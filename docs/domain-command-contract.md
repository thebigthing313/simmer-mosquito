# Domain Command Contract

This contract captures rules shared by SIMMER domain command designs. Load this
file when implementing or reviewing command builders, command handlers, sync
mutation adapters, or offline/mobile replay behavior. Load the specific
`docs/*-domain.md` file only for domain-specific vocabulary and exceptions.

## Command Shape

- Domain commands represent user intent, not database patches.
- Commands create durable rows with client-generated UUIDs where the client can
  reasonably know the id before submit.
- Commands carry domain actor ids, operational dates/times, and source ids that
  make offline replay and audit attribution explicit.
- Command payloads should be stable enough for optimistic UI metadata, command
  logs, and future mobile queues.

## Validation Boundary

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

## Delete Policy

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

## Offline And Sync

- Offline queues store domain commands, not DB-shaped patches.
- Read/sync rows may expose database representation details, but commands should
  carry domain concepts.
- Inactive non-deleted lookup rows should remain syncable when historical
  records need labels, but they should not be offered for new selection.
- Detailed Electric/TanStack DB shape policy belongs in `docs/sync.md` unless a
  domain doc records a specific exception.

## Location Sources

Location-bearing commands carry a domain location source. The source may be
explicit GeoJSON geometry or an allowed same-organization locatable record.
Server handlers store explicit geometry directly on the target row or snapshot
the source record's owned geometry inside the authorized transaction.

Domain docs own the allowed source flows for each workflow.

## Module Shape

`packages/domain` should expose stable top-level public seams while allowing
large domains to split implementation internally. Shared primitives belong in
domain-neutral modules only when at least two domains need the same concept.

Domain tests should live near the package's domain tests and cover builders,
normalizers, derived status helpers, and boundary cases that do not require a
database. Server handler and persistence behavior should be tested where the
handler or database layer owns it.
