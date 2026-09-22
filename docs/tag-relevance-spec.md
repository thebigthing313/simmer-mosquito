# Tag relevance

A Tag names the record types it is meant for, and the tag picker on a record
lists those Tags first. Nothing is enforced: the relevant types are a preference
the picker reads, and any active Tag still goes on any taggable record of the
Organization.

This was written before any of it was built, and the build followed it. The
picker did not exist either: `apps/web` drew Tags on map cards, explorer rows,
route stops and the detail header, and edited the catalog under My organization,
but nothing dispatched `fieldWork.assignTag` or `fieldWork.unassignTag`. So the
spec covers the picker as well as the field.

The decisions behind it were charted on
[#1204](https://github.com/thebigthing313/simmer-mosquito/issues/1204), and each
section below names the ticket that settled it.
`docs/field-work-support-domain.md` carries the Tag catalog, the six taggable
targets, the permissions and the lifecycle, and is the doc to read first.

## The column

`tags` gains one column (#1206):

```sql
alter table tags
  add column relevant_entity_types text[] not null default '{}';

alter table tags add constraint tags_relevant_entity_types_known
  check (relevant_entity_types <@ array['address','region','trap','habitat','contact','service_request']::text[]);
```

A `text[]` and not a join table: the set is at most six fixed names on a catalog
that is already eager, and a join table would buy a second shape route, a second
collection and a second write path for something the picker reads on every
render. Not a Postgres enum array either. The enum's one prize is putting the
member list under `check:column-vocabularies`, and it costs an enum-array branch
in both generators plus a snake_case Postgres enum twinning the camelCase
`TAG_TARGET_TYPES`.

`not null default '{}'`. The empty set means relevant everywhere. A nullable
column would give that one idea two spellings with a branch owed at every
reader, and the default backfills every existing Tag to "all records" with no
data step of its own.

The values are snake_case, the same words `tag_items.entity_type` stores, so the
picker compares `toDbEntityType(recordType)` against the column with no bridge on
the read. `tag_items.entity_type` itself stays `text` with no constraint; this
check is on the new column alone.

The check enforces membership and nothing else. `<@` passes on the empty array
and refuses an unknown name. Duplicates, ordering and nulls are the normalizer's
job, and a check stating those too would put three rules in SQL for one test to
read back out one at a time.

No static gate reads a SQL check's member list, so the check is held to the
register by a case in `packages/db/src/tests/integration/`, which is the
precedent ADR 0018's nine geometry CHECKs already set. It holds the two together
by writing a row per register member and a row per refused name rather than by
reading the constraint's source back: `pg_get_constraintdef` renders an array
literal with casts and whitespace of Postgres's choosing, and a regex over that
is the migration-text parse this repo has paid for twice. A dropped constraint
fails the refusal half.

## The domain register

`TAG_TARGET_TYPES` in `packages/domain/src/field-work/shared.ts` stays the one
camelCase register of the six taggable targets. The snake_case list is derived
from it by mapping `toDbEntityType` and exported from the domain barrel as
`TAG_TARGET_ENTITY_TYPES`. `TAG_TARGET_TYPES` needs exporting from the barrel
too, which it is not today, so the web can label the six.

Two copies cannot read TypeScript: the SQL check, held by the integration test
above, and the generated row schema line, which is `z.array(z.string())` rather
than an enum array. That is forced rather than chosen. The generated drift suite
compares with `Equals`, exact type identity, against `SelectType` of the Kysely
column, and `text[]` types as `string[]` in `packages/db/src/tables.ts`. A
`z.enum([...six]).array()` infers a narrower union and fails `_Tag` in
`drift.test.ts`. So the six live in the domain and not on the wire, and the
picker compares with `includes` rather than narrowing at the read boundary.

The domain term is **relevant record types**. `entity_types` in the column
because the values are `entity_type` values, `record types` in the copy because
that is what `RECORD_NOUNS` and the UI call them.

## The generator branch, which lands first

`zodFor` in `scripts/generate-table-schemas.mjs` returns
`{ zod: null, unknownType: bare }` for anything it does not recognise, and the
caller prints `UNMAPPED` and emits no field. So the branch lands before the
migration, or `check:schemas` and the drift suite fail in opposite directions on
a hand-written line.

A `string[]` branch only, emitting `z.array(z.string())` and
`z.array(z.string()).nullable()` for the nullable spelling, beside the `string`
branch and after the `Generated<>` unwrap. This is the workspace's only synced
array, and a recursive element reader would be a mechanism written for one
caller. The next array type is the branch that adds itself.

Order: the `zodFor` branch, then the migration, then `pnpm db:migrate`,
`pnpm generate:table-types`, `pnpm generate:schemas --write`.

## What Electric does with the live handle

`columnsOf` in `apps/server/src/sync-shapes.ts` builds each shape's `columns`
param from `syncedColumnsOf(schema)` and the proxy forces it upstream. Adding a
synced column to `tags` changes the shape definition, so Electric hands out a new
handle and every client re-snapshots `tags`. That is a catalog of tens of rows
per Organization: one re-snapshot on the deploy.

Nothing is withheld, so `WITHHELD` in `scripts/withheld-columns.mjs` is
untouched. Electric parses `dims > 0` through `pgArrayParser` and TanStack DB's
`deepEquals` walks arrays, so the column arrives as `string[]` with no parser
added.

## `updateTag`

One more entry in `TAG_UPDATE_FIELDS` in `packages/domain/src/field-work/tags.ts`
(#1206):

```ts
relevantEntityTypes: normalizeRelevantEntityTypes,
```

`UpdateFieldSet`'s normalizer is `(value, path, issues, actor) => output`, so the
input type, the `changes` type, the empty-edit check and the builder all read off
that one entry. A whole-set replace, not a delta: a delta buys nothing for a
six-member set edited by one person in one dialog, and the whole-set field keeps
"named nothing" meaning "leave this alone", which is the distinction the server
reads.

The normalizer:

- dedupes,
- refuses an unknown name with an issue naming the value,
- sorts into `TAG_TARGET_TYPES` declaration order rather than alphabetically, so
  the stored array and the picker's list read the same way and two edits meaning
  the same set produce the same row,
- collapses all six to `{}`, so `{}` is the only stored spelling of
  "everywhere", whoever writes it, mobile and any later caller included,
- allows the empty array, so clearing the set is an ordinary update rather than a
  second command.

Unknown names are refused twice, in the validator and in the check, and that is
deliberate rather than redundancy: the validator so the client fails in the
domain with a path and a message, the check so a write that reached Postgres
another way cannot land.

`createTag` takes nothing for this and a new Tag gets `{}`.

Mechanically, with no decision left in it: `tagReturnColumns` in
`packages/db/src/domains/foundation-tags.ts` gains `relevant_entity_types`,
`UpdateTagInput` gains it, and `updateTag` sets it under the same `undefined`
guard the other three fields use. `assignTag` is unchanged, because relevance is
not enforced.

## The Tags table under My organization

Settled in #1209. A fifth column, `Suggested For`, between Description and Color.

**The read cell.** Muted text, the register's `titleMany` forms comma-joined in
register order, and `All records` for the empty set. Not chips: a chip one cell
over from the Tag Preview badge reads as six more tags on the row. It draws for
everyone, the way the other read cells do, since `canManage` gates only the
Actions column.

**The width.** `TagTableSection` sizes the table as the sum of its CSS-var column
widths rather than `w-full`, and the four existing ones max out around 886px
inside the 1616px `record` measure, so
`[--tag-relevance-column:clamp(160px,20vw,240px)]` widens the table without
squeezing a neighbour.

**The editor cell.** `MultiSelect` from `packages/ui-web`, options labelled with
the register's `titleMany` read through `recordNoun`, `placeholder="All records"`
so the empty set states itself rather than reading as unset. The control is a
combobox: the selections show as removable chips in the cell and typing filters
the list in a popup. Six checkboxes laid out in the cell were the alternative,
and they show every option with no popup, but they add roughly 90px to an editor
row that is already the tallest thing on the page, and `MultiSelect` is the
registered primitive for this.

Ticking all six saves `{}`. The collapse is the `updateTag` normalizer's, above;
the client collapses for its own display and is not the guard.

**The label** is `Suggested For`, in the column header and on the editor's
`FieldLabel`. `Applies To` reads like a rule and nothing is enforced.
`Suggested For` says preference, and it pairs with the picker's `For habitats`
heading.

**`TagCreatePanel` offers no relevance field.** `createTag` takes nothing, so
offering one there means a chained create-then-update: a second command and a
second failure mode on Add. A new Tag is relevant everywhere, and narrowing it is
one Edit click away on the row that just appeared. Its two `TagFormValues`
literals carry the empty set, because the type requires it.

`TagFormValues` and `tagFieldsFrom` in
`apps/web/src/components/my-organization/` gain the set, and `TagFields` and
`TagRecord` with them.

## The picker

### Where it opens

Settled in #1207 against a prototype on `prototype/tag-picker-1207`.

A counted `Tags` button at the end of the detail header's chip row, opening a
modal. The chip row is `RecordTags` inside
`apps/web/src/components/record/detail-page-header.tsx`, and all three headers
already reach it through the `tags` prop: `DetailPageHeader` draws address,
region, trap and contact directly, `habitat-detail.tsx` and
`service-request-detail-header.tsx` pass the same prop. So the "one shared
component for all six" #1222 asked for is the component that exists, and what
changes is that it stops returning `null` for an untagged record and starts
reading the record type.

The `tags` prop gains the record type, or `RecordTags` reads the header's own
`recordType`, which is already required and is already the register's key. Either
way the picker heading is read off `RECORD_NOUNS` and the module stays on
`check:record-nouns`' list of readers.

An untagged record draws the button with no count rather than nothing. That is
what closes the old rule that hid an empty tag row: the row is no longer empty,
it holds the control.

A modal over the whole catalog, not a popover checklist and no widen control: the
full catalog is on screen from the start, and relevance orders it rather than
filtering it.

### What it lists

Settled in #1208. Two sections, always both, each row a checkbox with the tag
chip and its description.

`For habitats` holds every active Tag relevant to this record's type, which is a
Tag naming the type in `relevant_entity_types` and also a Tag whose set is empty,
since empty means relevant everywhere. That second half matters on a fresh
Organization, where every Tag is empty and a rule sorting them into the other
section would draw a picker reading as if nothing were set up.

`Every other tag` holds the rest of the active catalog.

The heading is `For ${recordNoun(recordType).many}`, read off the register.
`many` is already the lowercase mid-sentence form, so nothing lowercases
`titleMany`. `Every other tag` is fixed prose and names no record type.

There is no third section and nothing is pinned. An assigned Tag draws in the
section its relevance puts it in, checked, and both sections are on screen at
once, so it is never out of view. An assigned Tag that is not relevant to this
record's type sits in `Every other tag`, checked and counted. A third
`On this record` group would put one Tag in two places depending on a state that
changes as you click.

**A deactivated Tag that is assigned** draws in `Every other tag`, checked and
marked deactivated, whatever its relevant set says: relevance is a preference
about offering a Tag, an inactive Tag is never offered, so sorting it by
relevance sorts on a question that no longer applies. Unchecking it takes it off
the record and out of the dialog, which is the one-way door the catalog already
has.

**Ordering** is alphabetical by name inside each section, which is the order the
collection arrives in and the order the Tags table draws. Not assigned-first,
which reorders the list under the pointer as you click, and the checkbox already
says which are assigned.

### Search

One box over both sections, filtering each and keeping the headings rather than
collapsing to a flat list of matches. The headings are what the dialog is for,
and dropping them while typing hides the relevance of a match exactly when
somebody is picking one.

A match is a case-insensitive substring of the name or of the description. Names
here are short and often compound, so a word-prefix rule would miss `culex`
inside `Treated - culex`, and with the whole catalog on screen an extra row costs
nothing. The description is in the match because the row draws it and the Tags
table already treats it as the Tag's second identifier.

### The two empty cases, and their copy

Both sections stand while the search box is empty, each over a line of its own
when it holds nothing. `For habitats` empty means the catalog has nothing set up
for this record type, and the Tags table is where that is fixed:

> No tags are suggested for habitats yet. Set one up under My organization.

`Every other tag` empty means every active Tag is on offer here, which is what a
fresh Organization looks like, since a Tag that names nothing is relevant
everywhere:

> Every active tag is suggested for habitats.

The record noun is the register's `many` in both.

With text in the box neither line applies, because a line under an empty section
would answer a question nobody asked, so an empty section drops out entirely.
When both drop out the dialog draws one line:

> No tags match your search.

The surviving heading still says which side the matches fell on, and two stacked
"nothing matches" lines would say one thing twice.

### Unassign

From the checklist, and from an `x` that appears on a header chip on hover. The
chip's `x` is the shortcut for the common case, one tag coming off; the dialog is
the path that works without a pointer, so nothing is reachable only by hover.

## The write path

Settled in #1223.

### A checkbox writes on the click

One command per box through `mutateCollection`, so the dialog closes rather than
saves and the header `x` is the same call. Batching on `Done` would give one idea
two write timings, since the header `x` already writes outside the dialog, and a
`Cancel` that has to mean "undo what you ticked".

### The hook

One new file, `apps/web/src/hooks/mutations/use-record-tag-mutations.ts`, beside
the catalog's `use-tag-mutations.ts` and modelled on
`use-additional-personnel-mutations.ts`. It exports `assign(target, tagId)`,
`unassign(tagItemId)` and `canWrite`, each through
`settleWrite(mutateCollection(...))` naming `fieldWork.assignTag` or
`fieldWork.unassignTag`.

No `setTags` reconcile helper. With a per-click write nothing saves a set, and a
helper with no caller is what `fallow dead-code` refuses.

The optimistic insert writes `entity_type` in the column's own snake_case through
`toDbEntityType`, so the optimistic row and the row Electric streams back are one
row.

The dead `fieldWorkMissionMutations` pointer in `use-tag-mutations.ts`'s docblock
is corrected to name this file, in the same branch.

### The read grows a column

`use-record-tags.ts` projects `id: coalesce(tag.id, item.tag_id)` today, and
`unassignTag` takes `tag_items.id`, which is not in the result. So `tag-view.ts`
gains:

```ts
export interface AssignedTag extends Tag {
	readonly tagItemId: string;
}
```

The query selects `item.id` beside the four it has, and `useRecordTags` returns
`readonly AssignedTag[]`.

`Tag` itself is unchanged. It is shared by the five map cards, the explorer rows,
`activity-data.ts`, `service-request-nearby.ts`, `use-entity-tags.ts` and
`use-tag-options.ts`, and the last two have no link row at all. Every read-only
chip drawer keeps taking `Tag` and is fed the wider row structurally.

Nothing else changes in that query. The `inner` join is to the eager `tags`, so
an optimistic insert joins on the spot and the chip draws before the server
answers, and the detail header's chip row is mounted whenever the picker is open,
so `awaitTxId` always has a subscriber.

### A failed write rolls back and says why

TanStack DB rolls the optimistic row back, so the tick un-ticks by itself. The
picker and the header `x` each catch and show
`toast.error(errorMessageForSave(error))`, the my-organization wording. The
rollback alone is not enough: a tick that silently undoes itself reads as a
broken checkbox.

### The duplicate collision becomes a 409

`tag_items` carries a partial unique index on
`(tag_id, entity_type, entity_id) where deleted_at is null`, which fires when two
people tick the same box or one person ticks it on two devices. Nothing passes a
`duplicate` refusal today, so `23505` is a 500 with an unreadable body.

The `assignTag` insert in `apps/server/src/writers/field-work/tag-items.ts` goes
through `refusableWrite` with a `duplicate` refusal, and the client toasts the
reason. `refusableWrite` lives in `apps/server/src/table-commands/shared.ts` and
no writer imports from `table-commands/` today, so either that edge is added or
the helper moves beside `CommandError` in `command-endpoint.ts`, which every
writer already imports, and `table-commands/shared.ts` re-exports it. The second
keeps the import direction the tree has.

Not idempotent. Swallowing the collision would return a row whose id the client
never minted, so the optimistic row and the streamed row would be two rows for
one assignment. The reading to accept is that the toast says the write was
refused while the other client's row arrives by sync and the chip stays.

Re-assigning after an unassign needs nothing special: the unassign is a soft
delete, the unique index is partial on `deleted_at is null`, and the next assign
inserts a fresh row with a fresh client-minted id.

**Unassigning an inactive Tag is the same call.** `unassignTag` takes the link
row's id and never reads the catalog row's `is_active`.

**Neither command carries an acknowledgement flag**, and none is added. Assigning
is not destructive, unassigning is one click to put back, and
`UNCHECKED_ACKNOWLEDGEMENTS` stays where it is.

## Roles

Unchanged from the Tag permissions the domain doc already states.

Editing a Tag's relevant record types is `updateTag`, so manager-and-above, and
it is drawn where the rest of the catalog editor is drawn.

Assigning and unassigning stay collector-and-above, gated where the control is
drawn with `WriteOnly`: the counted button, the checkboxes and the header chip's
`x`. The chips themselves draw for everyone.

## Surfaces that do not get the picker

Settled in #1222. One rule per surface rather than per record type: every other
surface that draws a Tag draws it read-only.

- **The five map cards** keep drawing chips through `useRecordTags` and gain no
  button. A card closes on a map click, and a modal opened from one covers the
  map it was opened over. The card's title already links to the detail page.
- **Explorer rows** keep `useEntityTags` for the chips. A per-row control is 25
  buttons of chrome on a page for a write nobody makes from a list.
- **The record's own edit form** carries no Tags field. The picker writes on its
  own while the form's save dispatches the record's own command, so a Tags field
  inside the form would have already written by the time somebody hit Cancel.
- **The route stop list** keeps `use-stop-meta` drawing a stop's habitat tags
  read-only. Leaving a note from the run is a field-work feature with its own
  control.

## Mobile

The column syncs to mobile with the rest of the catalog. When mobile gets a tag
picker it reads the same rule: an empty `relevant_entity_types` is relevant
everywhere, the set orders the list rather than filtering it, and any active Tag
still goes on any taggable record.

## Out of scope

- Enforcing relevance on the server. The feature is an affordance, and a refusal
  would turn a preference into a rule the catalog editor never signed up for.
- Bulk tagging from an explorer selection, and leaving a Tag from a route stop
  while working the route. Each is its own control with its own feature behind
  it.
- New taggable targets: routes, assignments, weather stations. The domain doc
  defers routes and assignments on purpose.
- A constraint or enum on `tag_items.entity_type`, beyond what the new column's
  check needs.
- Filtering or reporting by Tag per record type.
- A mobile picker.

## Build order

1. The `string[]` branch in `zodFor`.
2. The migration, then `pnpm db:migrate`, `pnpm generate:table-types`,
   `pnpm generate:schemas --write`.
3. The `pg_constraint` integration case over the new check.
4. `TAG_TARGET_ENTITY_TYPES`, the `TAG_TARGET_TYPES` barrel export, the
   `TAG_UPDATE_FIELDS` entry and its normalizer, with domain tests.
5. `tagReturnColumns`, `UpdateTagInput` and `updateTag`.
6. The Tags table column and its `MultiSelect` editor.
7. `AssignedTag`, the `item.id` select, and `use-record-tag-mutations.ts`.
8. The `refusableWrite` wrap on the `assignTag` insert.
9. The counted button, the modal, search and the two empty lines.

Steps 6 and 7 are independent of each other; everything else is in order.
