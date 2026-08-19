# 14. Generated table schemas replace sync descriptors

Date: 2026-08-19

## Status

Accepted. Amends ADR 0007, whose package boundary this keeps and whose
mechanism it replaces.

## Context

ADR 0007 drew a boundary in May 2026: `packages/sync` owns what is true of a
table everywhere, each frontend owns its own collection singletons. The reason
was that a singleton carries sync mode, persistence, and lifecycle, and web and
mobile need different ones for the same table.

That boundary held. What did not hold was the artifact it was drawn around.

**Descriptors were written by hand, one file per table.** Fifty-six of them, in
`packages/sync/src/descriptors/`, each listing the table's columns. The
migrations are the source of truth for what a column is, so every descriptor
was a second copy of a schema, maintained by whoever remembered. Nothing
compared the two. A column added by a migration and forgotten in a descriptor
does not fail: the shape simply never streams it, and the surface reading it
renders empty. That is the same class of silent-wrong-answer this system keeps
producing, and it cost real debugging time more than once.

**The descriptor also carried decisions that were not the package's to make.**
ADR 0007's own list gives `packages/sync` "web and mobile policy descriptors"
and "retention metadata for rolling windows", and the descriptors declared
`syncMode` directly. So the package that existed to stop web and mobile being
forced into the same sync mode was the file where that mode was written down.
`apps/mobile` had not arrived yet to prove the contradiction, which is why it
survived a year.

**"Tracer descriptor sets" outlived their purpose.** 0007 named read-only
tracer sets as a deliberate boundary for the first vertical slice, and said
mutation handlers must be added to them deliberately. That was right for a
slice. Once every table has a write path it is a distinction with nothing on
the other side of it, and it made "is this table writable" a property of a
descriptor set rather than of the server.

## Decision

Keep ADR 0007's boundary. Replace its mechanism.

**Row schemas are generated from the database, not written.**
`scripts/generate-table-schemas.mjs` emits one schema per table into
`packages/sync/src/collections/tables/` from the applied migrations, and emits
the drift check alongside it. `ClientOmitted` drops `geom`, `geojson`,
`deleted_at`, and `deleted_by_profile_id` from every table; anything else a
table withholds is declared in `WITHHELD`, constrained to `keyof TTable`, so
withholding a column a migration has since dropped is a type error rather than
a line that quietly withholds nothing. A schema that fails to cover a column
does not compile.

**Sync mode, preload policy, and retention move to the app.** The factory
`packages/sync/src/collections/functions/sync-collection.ts` takes `syncMode`
as an option instead of reading it from a descriptor. `apps/web` declares it in
each of its fifty modules under `src/lib/collections`.

**Writability is a server property.** `apps/server/src/table-commands/` is
where a table declares the intents its route accepts. A table absent from it
accepts no writes. There is no read-only class of collection.

**Tracer descriptor sets are removed.** Nothing replaces them.

## Consequences

- The package defines 56 table schemas; `apps/web` instantiates 50. The six it
  skips (`users`, `genera`, `weather_source_subscriptions`, and the three
  notification tables) are the boundary doing its job: the schema exists for
  whoever needs it, and not instantiating it is the app's decision, reversible
  without touching the package.
- A migration that changes a column now fails the build until the schemas are
  regenerated. This is the point. Regenerate with
  `node scripts/generate-table-schemas.mjs`; do not hand-edit anything under
  `collections/tables/`.
- `apps/mobile` gets the same 56 schemas and picks its own modes, which is what
  ADR 0007 wanted and what the descriptors would have prevented.
- ADR 0007's package-responsibility list is superseded by this one. Its
  *decision* still stands: shared contracts, per-frontend singletons, and no
  universal prebuilt collection exported from `packages/sync`.
- The table-level matrix stays in `docs/sync.md` and still evolves without an
  ADR.
