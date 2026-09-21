# What a relevant-types column on tags costs

Research for issue [#1205](https://github.com/thebigthing313/simmer-mosquito/issues/1205),
under map #1204. Nothing here is built. Every claim is read off the tree at
`origin/develop` (`4e14fb3b`) on 2026-09-21, or off the local prod clone in the
compose Postgres with read-only queries, and says which.

## The answer

`tag_items.entity_type` holds the **snake_case** spelling, so the new column
holds `service_request` and not `serviceRequest`, and the picker matches it
against `toDbEntityType(recordType)`.

The column costs the four commands CLAUDE.md names plus one line in a generator
nobody has had to touch for an array before: `zodFor` in
`scripts/generate-table-schemas.mjs` has no branch for `string[]`, so a `text[]`
column is reported `UNMAPPED`, emitted as no field, and both `check:schemas` and
the drift suite then fail on the hand-written field. No `text[]` exists on any
synced table today, so this is the first.

A `text[]` check constraint restates the six names in SQL, and no static gate
reads it. The one precedent for holding a SQL check's member list to a
TypeScript register is an integration test over the catalog, which skips without
`TEST_DATABASE_URL`.

## 1. What `tag_items.entity_type` is spelled in

The column is `entity_type text NOT NULL` with no check
(`packages/db/schema.sql`, the `tag_items` block), indexed three ways on
`(entity_type, entity_id)`.

Every write goes through `toDbEntityType`. The writer in
`apps/server/src/writers/field-work/tag-items.ts` inserts
`entity_type: toDbEntityType(command.payload.target.type)`, and the four other
polymorphic writers beside it (`comments`, `additional_personnel`,
`route_items`, `assignment_items`) do the same. The bridge is
`packages/domain/src/field-work/shared.ts`:

- `toDbEntityType` is camelCase to snake_case, by replacing each capital with
  `_` and its lowercase. `serviceRequest` becomes `service_request`; a
  single-word type passes through unchanged.
- `fromDbEntityType` is the other way, and is called in two places: on the way
  in, `readEntityTarget` in `apps/server/src/table-commands/shared.ts` runs it
  over `payload.entity_type` before the domain's `validateTarget` checks the
  result against the camelCase `TAG_TARGET_TYPES`, so a client sending the
  column's spelling and one sending the domain's are both honoured
  (`polymorphic-support.test.ts` sends `service_request` to `assignTag`, and
  `field-work.test.ts` sends `serviceRequest` to `addAssignmentItem` through
  the same reader); and on the way out,
  `apps/server/src/search.ts` turns a search hit's `display.entity_type` back
  into a `CommentTargetType`.

Every read speaks snake_case to the column:

- `useEntityTags` in `apps/web/src/hooks/explorer/use-entity-tags.ts` filters
  `eq(item.entity_type, entityType)` on whatever string it is handed. Its three
  callers pass `'habitat'` twice (`use-stop-meta.ts`, the habitats explorer)
  and `toDbEntityType('serviceRequest')` once (the service requests explorer),
  which is the tree already saying which spelling the column holds.
- `useRecordTags` in `apps/web/src/hooks/queries/use-record-tags.ts` filters on
  `entity_id` alone and reads no type.
- `tagMembershipClauses` in `packages/db/src/domains/map-tag-filter.ts` says in
  its docblock that `entityType` is the snake_case spelling and that a camelCase
  value "matches nothing and reads exactly like an untagged record". Its two
  callers pass `'habitat'` (`habitats.ts`) and `'service_request'`
  (`public-engagement-map.ts`).

No seed writes `tag_items`. `packages/db/src/seeds/sync-baseline.ts` inserts
`tags` rows only, and `role-ladder.ts` writes `entity_type: 'habitat'` into
`assignment_items` and `comments`, both single-word. What is stored comes from
the writers, and the local prod clone confirms it (read-only, `docker exec`
into the compose Postgres):

| `tag_items.entity_type` | rows |
| --- | --- |
| `habitat` | 5,914 |
| `service_request` | 1,180 |
| `trap` | 12 |

Two organizations hold 14 tags between them, so the catalog is as small as the
domain doc expects. `comments.entity_type` in the same clone holds
`source_reduction` (967 rows) beside `inspection` and `collection`, so the
snake_case rule is the whole of the polymorphic tables and not a tag-only
convention.

So the new column's members are `address`, `region`, `trap`, `habitat`,
`contact` and `service_request`, and the picker compares against
`toDbEntityType(recordType)`. `toDbEntityType` is exported from
`@simmer-mosquito/domain` and `apps/web` already imports it.

## 2. Where the allowlist is declared, and what a check constraint restates

The six targets are declared once as code, `TAG_TARGET_TYPES` in
`packages/domain/src/field-work/shared.ts`, camelCase, `as const`, with
`TagTargetType` derived from it. `docs/field-work-support-domain.md` under "Tag
targets" lists the same six in prose. The only reader of the constant is
`assignTagCommand` in `packages/domain/src/field-work/tags.ts`, through
`validateTarget`. The field-work barrel re-exports the `TagTargetType` type and
`ADDITIONAL_PERSONNEL_TARGET_TYPES`, but not `TAG_TARGET_TYPES` itself, so a
picker or an editor in `apps/web` that wants the list has to add it to
`packages/domain/src/field-work/index.ts` first. That is one line and
`fallow dead-code` treats the barrel as an entry point, so it costs nothing.

A check constraint cannot read that list. The SQL is `packages/db/migrations`,
the list is TypeScript, and nothing generates one from the other; a
`check (relevant_types <@ array['address', ..., 'service_request']::text[])`
is a second copy, in the other spelling. Which gate would catch a copy:

- `check:column-vocabularies` would not. Its corpus is `.ts` and `.tsx` under
  `apps/*/src` and `packages/*/src` (`scripts/lib/source-files.mjs`), and its
  register is the seventeen Postgres enum types in `COLUMN_VOCABULARIES`. A
  check constraint is not an enum and a migration is not TypeScript, so the gate
  never sees it. It also would not catch a TypeScript copy of the six, because
  assertion 4 matches an array literal only against the seventeen enum member
  lists, and no enum holds these six.
- `check:table-types` reads column types out of the dump, not check members.
- `check:schemas` reads `tables.ts`, which has no check in it.

The one precedent for holding a SQL member list to a register is the geometry
matrix: the nine `*_geom_type_check` constraints restate `OWNED_GEOMETRY_POLICIES`
and `packages/db/src/tests/integration/owned-geometry.integration.test.ts`
reads the constraint back out of the catalog. CLAUDE.md says why that half is
not static: reading a check out of migration text is a small SQL interpreter.
The same shape here would be a case in a db integration suite that reads
`pg_constraint` for the tags check and compares its members to
`TAG_TARGET_TYPES.map(toDbEntityType)`. It skips silently without
`TEST_DATABASE_URL`, which is the cost CLAUDE.md records for every integration
half.

The other route is a Postgres enum `tag_target_type` with a `tag_target_type[]`
column. That puts the list where a static gate reads it: `check:column-vocabularies`
assertion 2 refuses a `CREATE TYPE ... AS ENUM` with no `COLUMN_VOCABULARIES`
entry, and holds the entry to the dump's members and order. It costs more than
it holds. The entry would carry snake_case (`service_request`) beside the
domain's own camelCase `TAG_TARGET_TYPES`, two lists in one package with a
bridge between them; and neither generator has an enum-array branch:
`baseTypeOf` in `scripts/generate-table-types.mjs` looks the bare type name up
in the register and `SQL_TYPES` matches `text[]` and nothing else, so
`tag_target_type[]` exits 1 with "Add it to SQL_TYPES". A `text[]` with a check
matches the map's own line, "a check constraint on the new column only".

## 3. What adding the column costs

CLAUDE.md's Database section says a migration is three commands: write it,
`pnpm db:migrate`, `pnpm generate:table-types`. For a synced table there is a
fourth, `pnpm generate:schemas --write`, and for this column a generator edit
ahead of it. In order:

1. **The migration.** `alter table tags add column relevant_types text[] not
   null default '{}'`, plus the check. `not null default '{}'` is what the
   map's "empty means relevant everywhere, and that is what a new Tag gets"
   asks for; a nullable column would make "no preference" two states.
2. **`pnpm db:migrate`** rewrites `packages/db/schema.sql`. `check:table-types`
   refuses a dump whose applied versions are not the migration files on disk.
3. **`pnpm generate:table-types`** rewrites `packages/db/src/tables.ts`.
   `SQL_TYPES` already maps `text[]` to `string[]`, and `unionType` wraps a
   not-null column with a default as `Generated<string[]>`. `CommandPayload`
   in `apps/server/src/command-payload.ts` is derived from that file, so
   `payload.relevant_types` types itself.
4. **`zodFor` in `scripts/generate-table-schemas.mjs` needs a branch.** Today
   it maps `string`, `number`, `boolean`, `Date`, `unknown`, the `*WithDefault`
   aliases and the register's enums, and returns `{ zod: null, unknownType }`
   for anything else. `string[]` hits that, and so does `Generated<string[]>`,
   because the unwrap is `/^Generated<(\w+)>$/` and `\w` does not match `[`.
   The dry run prints `UNMAPPED tags: relevant_types: Generated<string[]>` and
   emits no field, and the report is printed rather than failed on. Without
   the branch, the two gates disagree with each other: `check:schemas`
   refuses a `relevant_types` line written by hand as a field "this generator
   does not emit", and the generated drift suite's `MissingColumns` refuses
   the schema without it, because `Generated<string[]>` selects as `string[]`
   and is a key the table has. The branch is one line, mapping both spellings
   to `z.array(z.string())`; `ChangedColumns` then compares `string[]` to
   `SelectType<Generated<string[]>>`, which is `string[]`, and passes. The
   dry run today reports no `UNMAPPED` line, so this is the first array on a
   synced table and there is no shape to copy.
5. **`pnpm generate:schemas --write`** merges one field line into
   `packages/sync/src/collections/tables/tags.ts` after `is_active` and leaves
   the rest of the file alone. The collection factory, the two barrels and the
   drift suite are regenerated whole.
6. **`WITHHELD`** in `scripts/withheld-columns.mjs` needs nothing. It holds
   `memberships` and `organizations` only, and the column is meant for every
   client.
7. **The shape.** Nothing on the server names a column by hand. `columnsOf` in
   `apps/server/src/sync-shapes.ts` is the row schema's field list, forced
   upstream as `columns=`, so the column reaches the `tags` shape the moment
   it reaches the schema. `apps/server/src/return-columns.ts` derives the
   command response from the same list. The one hand-written list left is
   `tagReturnColumns` in `packages/db/src/domains/foundation-tags.ts`, which
   the foundation writer's `.returning()` uses; it needs the new name or the
   201 and 200 answer without it.
8. **Electric streams an array without help.** `@electric-sql/client@1.5.23`
   (`src/parser.ts`, `parseRow`) reads `dims` off the shape's schema header
   and, when it is above zero, runs `pgArrayParser` over the column with the
   element type's parser, `text` being identity. `shapeParsers` in
   `packages/sync/src/collections/functions/sync-collection.ts` adds
   `timestamptz` only and is merged over the default parser, so a `text[]`
   arrives as `string[]`. `deepEquals` in `@tanstack/db@0.9.2` (`utils.js`)
   walks arrays element by element, so a `mutation.changes` diff reads a
   changed set as a change and an unchanged one as none. The docs under
   `docs/sync.md` say nothing about a column added to a live shape and the
   tree carries no code for it; what the tree does say is that the column
   list is the server's and the client asks for what the server forces.
9. **The command.** `updateTag` runs through `TAG_UPDATE_FIELDS` in
   `packages/domain/src/field-work/tags.ts`, an `UpdateFieldSet` of three
   normalizers, so the field is a fourth entry there with a normalizer that
   maps the list through `TAG_TARGET_TYPES`; `apps/server/src/table-commands/tags.ts`
   reads it off the payload when it arrived, the way it reads `color`; and
   `updateTag` in `packages/db/src/domains/foundation-tags.ts` sets it when
   present. `command-payload.ts` has `readText` and `readNullableText` and no
   list reader; `readIdList` in `table-commands/shared.ts` is the nearest
   shape, an array of strings with a non-string substituted so the domain
   refuses it by index.
10. **The web client.** `TagFields` and `save`'s change set in
    `apps/web/src/hooks/mutations/use-tag-mutations.ts`, `TagRecord` in
    `hooks/queries/use-tag-catalog.ts`, `TagFormValues` in
    `components/my-organization/types.ts`, `tag-form-values.ts`, and the three
    rows under `components/my-organization/` (`tag-create-panel.tsx`,
    `tag-editor-table-row.tsx`, `tag-display-table-row.tsx`). Labels come from
    `recordNoun` in `apps/web/src/lib/record-nouns.ts`: a literal
    `'Service requests'` under any key is a `titleMany` and `check:record-nouns`
    refuses it.

The picker's match is in-memory. `tags` is eager, and `inArray` in
`@tanstack/db` takes an `ExpressionLike` on both sides and evaluates the `in`
case with `Array.isArray` over the right operand, so
`inArray(toDbEntityType(recordType), tag.relevant_types)` reads as a live
query predicate. Whether the subset compiler could push that over Electric is
not a question the picker asks, since nothing about the catalog is on-demand.

## 4. Precedent

There is none for a `text[]` on a synced table. The only `text[]` in
`packages/db/schema.sql` is `search_documents.search_text`, and that table is
in `NOT_A_KYSELY_TABLE` in `scripts/generate-table-types.mjs`, so neither
generator has ever met an array. `packages/db/src/tables.ts` has no `string[]`
and no row schema under `packages/sync/src/collections/tables/` has a
`z.array`.

The nearest thing to a small set on a catalog row is `custom_schema jsonb` on
`habitat_types` and the five method catalogs (`application_methods`,
`biocontrol_methods`, `collection_methods`, `outreach_methods`,
`source_reduction_methods`). Its row schema line is `z.unknown().nullable()`,
the catalog dialog holds it as `customSchema: JsonSchemaValue` in
`apps/web/src/components/catalog/catalog-fields.ts`, and the server passes it
through as `customSchema: request.payload.custom_schema ?? null` in
`table-commands/control-methods.ts`. That is a document, not a set, and it says
what the tree does with an opaque column: everything downstream of the schema
treats it as `unknown`. A `text[]` is better than that, because
`z.array(z.string())` gives the picker a typed list without a parse.

The other precedent is the geometry check above: a SQL member list beside a
TypeScript register, held by an integration test and by nothing static.

## What was not answered

Whether Electric re-snapshots a live `tags` shape when the column is added is
not in the tree. The server forces the column list, so the client's next shape
request names the new column; what Electric does with the old shape handle is
Electric's behaviour, and this note reads only source.
