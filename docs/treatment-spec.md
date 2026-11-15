# Treatment above Chemical Application

What it takes to put a **Treatment** above **Chemical Application**: one record
per visit holding what the visit shares, with one Chemical Application under it
for each Insecticide that went out. ADR 0020 is the decision and why it was
chosen; this is what gets built.

Nothing here is built yet. Every decision below was settled on the map in #1733,
whose ten tickets hold the reasoning and the rejected alternatives. Each section
names the ticket it comes from. Where two tickets disagree, the later one wins,
and the section says so. The full list of those conflicts, and of the gaps found
while writing this document, is under
[Conflicts and gaps](#conflicts-and-gaps-settled-in-this-document).

## What drives it

A catch basin mission that mixes two insecticides has nowhere to put the visit.
Today it saves two `applications` rows, each repeating the date, the applicator,
the method, the equipment, the geometry and every link, and the job's own data
(total basins, dry, wet) has no row to live on. Counts read the two rows as two
jobs. The Formulation path already does this at scale:
`expandFormulationApplicationCommands`
(`packages/domain/src/control-operations/products.ts`) turns one mix into N
separate creates, repeats every visit field, comment and personnel row on each,
and the form handles a partial failure when the third of five creates is
refused.

Pesticide-use reporting does not need a per-product row for anything but the
product. Every rule read in #1738 (7 CFR 110, 40 CFR 171, California 3 CCR 6624
and 6627 and the CDPH vector control agreement, N.J.A.C. 7:30-6.8, New York ECL
33-1205, Florida 5E-13) keys the record to the application and names each
product inside it. Product, EPA registration number and amount are per product.
Date, applicator, location, area, site, method and target are once per
application. No rule asks for a location or area per product. The findings are
on the `research/pesticide-use-reporting` branch, in
`docs/research/pesticide-use-reporting.md`.

## The shape of the change

- A new table, `treatments`, holds the visit: when, by whom, how, where, what it
  was linked to, and the method's custom fields.
- `applications` keeps its name and its ids and becomes the line: one
  Insecticide, one amount, one unit, and its batch links. It gains
  `treatment_id NOT NULL` and loses every visit column.
- Every Chemical Application belongs to a Treatment. A job with one product is a
  Treatment with one line. A Treatment holds at least one live line, and at most
  one live line per Insecticide.
- Every write goes through `/commands/treatments`. The line set travels whole,
  and the server diffs it.
- Only a Treatment takes a Habitat off the untreated list.
- A Treatment may name the Formulation it was mixed from. While it does, its
  lines are exactly that recipe scaled to the mix amount.
- One migration backfills one Treatment per existing row, reusing the row's id,
  and lands in one cutover.

Source Reduction, Biocontrol Action and Outreach Action are untouched. Several
products under one method is specific to insecticide work.

## Glossary

From #1735 and #1736, as amended by #1743. These land in `CONTEXT.md` in the
same PR as this document.

- A **Treatment** is one visit's insecticide work: when, by whom, how and where.
  Each **Chemical Application** under it is one **Insecticide** and one amount.
  Every Chemical Application belongs to a Treatment, and a job with one product
  is a Treatment with one Chemical Application.
- An active **Habitat** is **untreated** while its latest inspection came back
  heavy or very heavy, no **Treatment** dated on or after that inspection names
  the habitat or the inspection, and no unresolved **Requested Control Action**
  names it. A **Source Reduction** or **Biocontrol Action** does not take a
  habitat off the untreated list.
- A **Formulation** is an Organization's saved mix of Insecticides: what one
  batch takes of each and how much finished mix it makes. A **Treatment** mixed
  from one records the Formulation and the amount of finished mix applied, and
  its Chemical Applications are that recipe scaled to the mix amount.
- "Treatment" and "treated" mean insecticide work, as the industry uses them. A
  Source Reduction or Biocontrol Action is control work, not treatment.
- "Application" can mean software or control work. **Chemical Application** is
  one product's line within a **Treatment**, and **Treatment** is the visit.

The Formulation entry drops #1736's closing clause, "they are the source of
truth when the two disagree", because #1743 made the two unable to disagree on a
write.

## The schema

From #1734, with the Formulation columns from #1736 and the constraints from
#1741 and #1742.

### `treatments`

| Column | Notes |
|---|---|
| `id` | uuid, client-generated; a backfilled row reuses its `applications.id` |
| `organization_id` | `NOT NULL`, FK to `organizations` |
| `application_date` | `date NOT NULL` |
| `applicator_profile_id` | FK to `profiles`, `SET NULL` |
| `application_method_id` | FK to `application_methods`, `SET NULL` |
| `vehicle_id`, `equipment_id` | FKs, `SET NULL` |
| `address_id` | FK to `addresses`, `RESTRICT` |
| `habitat_id`, `inspection_id`, `collection_id` | context, FKs `SET NULL`; the `ControlActionContext` rules move here unchanged |
| `requested_control_action_id` | FK, `SET NULL` |
| `mission_item_id` | FK, `SET NULL`; fixed after create |
| `formulation_id` | nullable FK to `formulations` |
| `mix_amount` | nullable `double precision`, positive |
| `mix_unit_id` | nullable FK to `units` |
| `geom` | `geometry(Geometry,4326) NOT NULL`, all six shapes under ADR 0018 |
| `lat`, `lng`, `geom_type` | set by the `set_owned_centroid()` trigger |
| `geojson` | generated from `geom` |
| `metadata` | `jsonb`, validated by the method's `custom_schema` |
| audit columns | `created_at`, `updated_at`, `created_by_profile_id`, `updated_by_profile_id`, `deleted_at`, `deleted_by_profile_id` |

The column names keep their `application_` prefix. They are the same facts under
the same names, and renaming `application_date` to `treatment_date` would touch
every reader for no change in meaning.

Constraints on `treatments`:

- `treatments_formulation_all_or_none`: `formulation_id`, `mix_amount` and
  `mix_unit_id` are all set or all null.
- `treatments_mix_amount_positive`: `mix_amount > 0` when set.
- `treatments_geom_type_check`: the six-shape CHECK, copied from
  `applications_geom_type_check`.
- A unique index on `(id, organization_id)`, which the line's composite foreign
  key needs.

`metadata` is where catch basin totals and dry and wet counts live. The method is
chosen once per Treatment, so `application_methods.custom_schema` describes the
Treatment, and lines carry no `metadata`.

### `applications`, now the line

Keeps `id`, `organization_id`, `insecticide_id`, `amount_applied`,
`application_unit_id`, `applications_amount_applied_positive` and the audit
columns. Gains `treatment_id uuid NOT NULL`. Drops `application_date`,
`applicator_profile_id`, `application_method_id`, `vehicle_id`, `equipment_id`,
`address_id`, `habitat_id`, `inspection_id`, `collection_id`,
`requested_control_action_id`, `mission_item_id`, `metadata`, `geom`, `lat`,
`lng`, `geojson`, `geom_type`, the geometry CHECK and the `applications_centroid`
trigger.

A line has no date, no geometry and no counts. If two products went to visibly
different places, the crew records two Treatments. A second person who applied a
product goes in as Additional Personnel on the Treatment.

Constraints and indexes on the line (#1740, #1741):

- A composite foreign key `applications (treatment_id, organization_id)` to
  `treatments (id, organization_id)`. No other table in the schema has one yet.
  It is here because the line keeps its own `organization_id` for its sync shape
  (see [Sync](#sync)), and the composite key makes a line whose copy disagrees
  with its Treatment impossible rather than merely unlikely.
- A partial unique index on `applications (treatment_id, insecticide_id) WHERE
  deleted_at IS NULL`, which backs the one-line-per-Insecticide rule.
- An index on `applications (treatment_id) WHERE deleted_at IS NULL`, which the
  client include and the server's line reads seek on.
- `applications_organization_insecticide_idx` stays. The other per-Organization
  indexes on visit columns move to `treatments`: date, habitat, inspection,
  collection, address, method, mission item, requested control action, and the
  gist index on `geom`.

### `application_batches`

Unchanged. `application_batches.application_id` still names the line, a batch
must still match its line's Insecticide, and `organization_id` is still set from
the parent.

### Support records

Comments, Additional Personnel and tag items hang on the Treatment, never on a
line. Their polymorphic `entity_type` becomes `'treatment'`. Treatments are a new
tag target, so `tags_relevant_entity_types_known` widens to allow `'treatment'`.
Applications were never taggable.

## Untreated

From #1735, using #1734's at-least-one-line rule.

An active Habitat is untreated while its latest heavy or very heavy inspection,
inside the existing 7-day window, has no live Treatment dated on or after it that
names the habitat or the inspection, and no open Requested Control Action names
it. A Source Reduction or Biocontrol Action no longer clears it. A drained or
stocked habitat stays on the list until a later inspection comes back lower or
the reading ages out of the window.

`untreatedHabitatSql` in `packages/db/src/domains/habitats.ts` swaps its three
`not exists` clauses (applications, source reductions, biocontrol actions) for
one against `treatments`, matching on the Treatment's own `application_date`,
`habitat_id` and `inspection_id`. A Treatment always has a live line, so the
predicate needs no line check. The Requested Control Action clause stays as it
is.

The habitats explorer filter keeps its copy, "Treatment: Untreated", in
`habitat-filters.tsx`. The title now names the record.

What changes with it: the habitats explorer `untreated` filter and the habitats
map tiles, both through `untreatedHabitatSql`; the docblock there; the untreated
section of `docs/dashboard-spec.md`; and the integration world in
`packages/db/src/tests/integration/domains/untreated-world.ts`, which gains a
case where a Source Reduction after a heavy inspection leaves the habitat
untreated.

There is no separate "uncontrolled" state for Source Reduction and Biocontrol.
Nothing reads one today.

## The Formulation a Treatment was mixed from

From #1736, with decision 4 reversed by #1743.

The rule in `CONTEXT.md` and `docs/control-operations-domain.md` that a
Formulation is not stored as historical source data is reversed. A Treatment may
name the Formulation it was mixed from, with the amount of finished mix applied.

- **Reference, no snapshot.** The Treatment holds `formulation_id`, `mix_amount`
  and `mix_unit_id`, and no copy of the recipe. Its lines are what went out, and
  they are the only thing a snapshot would have kept.
- **The mix amount is stored.** It is the number the crew measured.
  `mix_unit_id` is the Formulation's `batch_unit_id` at save time, stored so a
  later change to the recipe's unit does not reinterpret the saved amount.
- **Lines follow the recipe.** While a Treatment names a Formulation, its live
  lines are exactly the recipe's products, in the recipe's units, at the amounts
  `calculateFormulationComponentAmounts` gives for `mix_amount`. This is #1743's
  reversal of #1736's decision 4, which had let the lines and the reference be
  edited independently with "the lines win" on disagreement.
- **Product by product leaves all three null.** A crew that used something other
  than the recipe records it product by product, which clears the reference.
- **Catalog lifecycle follows #123.** Editing a Formulation's recipe, name or
  batch size changes no saved Treatment. Deactivating it removes it from the
  picker, and existing links stay. Delete is refused while a live Treatment names
  it: `treatments.formulation_id` joins the Formulation's delete-impact rules as
  a `blocks` rule. An inactive Formulation is refused only when a write changes
  the reference to it.
- **Backfilled Treatments name no Formulation.** No provenance was recorded
  before, so all three columns are null.

### When the recipe check runs

The server recomputes the expected lines and compares them on any write that
changes one of these:

- the Formulation reference or the mix amount;
- the set of live lines;
- a live line's Insecticide, amount or unit.

`recordTreatment`, `recordTreatmentForMissionItem`, `updateTreatmentFieldDetails`
and `reviseTreatmentLines` all run it. A mismatch is a 400 naming the first line
that differs, or the missing product.

A revise that changes only batch links on a Treatment that names a Formulation
does not run the check. This is a gap #1743 left open, closed here: its rule says
the check runs at write time only and a later recipe edit changes no saved
Treatment, but read literally, "revises the lines of a Treatment that names one"
would refuse a batch-only edit on any Treatment whose recipe was edited after it
was saved. The saved lines are the record of the recipe as it stood, so a write
that leaves them alone has nothing to compare.

The comparison is exact equality on `double precision`. The form computes each
amount with `calculateFormulationComponentAmounts` from the synced recipe, the
server computes it with the same function from the same row, and a JSON round
trip preserves a double exactly. A recipe edited between the form loading and
the save is a 400, and the form answers it by recomputing the rows from the
current recipe.

### The helpers

`calculateFormulationComponentAmounts` stays. `expandFormulationApplicationCommands`
is deleted: the Formulation path builds one `recordTreatment` with one line per
component, and the domain builder for that payload calls
`calculateFormulationComponentAmounts` itself. "Generated applications from one
formulation expansion are not linked together" and "omit `formulationId` from
command payloads" leave `docs/control-operations-domain.md`.

## Commands

From #1740, with the Formulation check from #1743.

| Command | Route | Floor |
|---|---|---|
| `controlOperations.recordTreatment` | `POST /commands/treatments` | COLLECTOR |
| `missionDispatch.recordTreatmentForMissionItem` | `POST /commands/treatments` | OWN_MISSION_ITEM |
| `controlOperations.updateTreatmentFieldDetails` | `PATCH /commands/treatments/{id}` | OWN_TREATMENT |
| `controlOperations.updateTreatmentLocationAndContext` | `PATCH /commands/treatments/{id}` | OWN_TREATMENT |
| `controlOperations.reviseTreatmentLines` | `PATCH /commands/treatments/{id}` | OWN_TREATMENT |
| `controlOperations.deleteTreatment` | `DELETE /commands/treatments/{id}` | DELETE_OWN_TREATMENT |

Retired: `recordChemicalApplication`, `recordChemicalApplicationForMissionItem`,
`updateChemicalApplicationFieldDetails`,
`updateChemicalApplicationLocationAndContext`, `deleteChemicalApplication`,
`addChemicalApplicationBatch` and `removeChemicalApplicationBatch`.
`/commands/applications` and `/commands/application_batches` accept no commands,
and their entries leave `apps/server/src/table-commands/index.ts` and
`WRITE_SURFACE_FLOORS`. Seven names leave the vocabulary and six arrive.

Every command answers `{ treatment, txid }`.

### Create

`recordTreatment` takes the Treatment's fields and an `applications` list spelled
as rows, following the `/commands/{table}` rule that nested child rows keep
their column names:

```ts
applications: readonly {
	id: DomainId;
	insecticide_id: DomainId;
	amount_applied: number;
	application_unit_id: DomainId;
	application_batches: readonly { id: DomainId; insecticide_batch_id: DomainId }[];
}[];
```

One Postgres transaction writes the Treatment, every line and every batch link.
The list must hold at least one line. `formulationId`, `mixAmount` and
`mixUnitId` are optional and travel together; when set, the server checks that
`mixUnitId` equals the Formulation's `batch_unit_id` and runs the recipe check.

`recordTreatmentForMissionItem` is the same payload under today's mission rules.
The stop's geometry is the default, the planned method is the default method,
`assertMissionGeometryCovered` reads `treatments`, and the execution flags still
complete the stop. Mission stop completion happens once per Treatment, not per
line.

### Lines are a set

`reviseTreatmentLines` carries the full list of lines the Treatment should have,
each with its batches, in the same row shape as create. The server diffs it
against what is stored:

- an id not yet stored inserts a line;
- a stored id whose fields or batches changed updates it, inserting and
  soft-deleting batch links to match;
- a stored live line missing from the list soft-deletes, with its batch links.

The at-least-one-line rule, the one-line-per-Insecticide rule and the recipe
check run against the final set, so one request can remove a line and add
another. A line's `treatment_id` never changes. An id in the set that belongs to
another Treatment is a 400, and so is the id of a soft-deleted line, which is not
restored. A kept line may change its Insecticide in place if the result still
holds one line per Insecticide.

A save that changes the header and the lines names both intents in one PATCH.
Every Treatment write is therefore one replay-safe request, which is the shape
mobile replays.

### Header edits keep today's split

- `updateTreatmentFieldDetails` owns `application_date`,
  `applicator_profile_id`, `application_method_id`, `vehicle_id`,
  `equipment_id`, `metadata`, and the Formulation set, which it sets or clears as
  one.
- `updateTreatmentLocationAndContext` owns `locationSource`, `address_id`,
  `context` and `requested_control_action_id`.
- `mission_item_id` cannot change after create.

### The one-line-per-Insecticide rule

From #1739, enforced as #1740 decided. The domain builder refuses a repeated
`insecticide_id` in one payload with a 400 naming the path. The server checks
again against the final set. The partial unique index backs both, so a race
between two saves ends in a constraint error rather than two live lines.

The rule is what makes counting simple: "lines naming product X" equals
"Treatments that used X". A second batch of the same product goes on the
existing line.

### Catalog references and the write-reference gate

From #1740, under #123. A reference is refused only when the write changes it to
an inactive or deleted row:

- a new line, or a line whose Insecticide or unit changed, needs an active
  Insecticide and unit;
- an added batch link needs an active batch;
- a kept line or batch link whose catalog row has since been deactivated passes.

Every id in the line set, and every batch id, goes through the write-reference
gate (`check:write-references`). A batch that does not match its line's
Insecticide is a 400. That check is new on the server: today
`insertApplicationBatch` runs only the catalog gate.

### Acknowledgements

The revise reads no acknowledgements. A line left out of the set is a removal the
crew made on the form, and the form's struck-through row is the warning (see
[The web form](#the-web-form)). `acknowledgedBatchClearance` leaves the
vocabulary and `ACKNOWLEDGEMENT_MECHANISMS` in `apps/server/src/acknowledgements.ts`,
and `check:acknowledgements` moves with it.

### Delete

`deleteTreatment` soft-deletes the Treatment and its lines with no flag, because
a Treatment's lines go with it. Batch links keep `acknowledgedBatchDeletion`.
Comments, Additional Personnel and tag items keep
`acknowledgedSupportRecordDeletion`.

In `record-deletion.ts` the deletable record type `application` becomes
`treatment`. Lines are not separately deletable. The Requested Control Action and
Mission detach rules, and every rule on a visit column (address, method, vehicle,
equipment, habitat, inspection, collection), name `treatments`. The Insecticide,
unit and batch rules still name `applications` and `application_batches`, read
through live lines. The detail page's danger zone reads the Treatment's impact.

### Floors

From #1740. Floors carry over and are checked against the Treatment.

- **OWN_TREATMENT**: a Collector edits their own Treatment within 30 days of its
  `application_date`. A Manager or above edits older Treatments and other
  people's. Today's separate guarded correction for changing an Insecticide is
  the same check, so it folds in.
- **DELETE_OWN_TREATMENT**: a Collector deletes their own Treatment within 30
  days only while it has no batch links, no support records and no Requested
  Control Action link. The escalation reasons keep their order and their names,
  and the `batch_links` copy reads "This treatment has insecticide batches linked
  to it".

`OWN_APPLICATION_VIA_BATCH` goes with the batch commands. It was the only floor
that needed two hops once the performer columns moved, and the `through` helper
in `command-permissions.ts` stays one hop.

Carried over unchanged, once per Treatment: the `ControlActionContext` rules and
the Requested Control Action link rules.

## Sync

From #1741.

| Table | Web | Mobile |
|---|---|---|
| `treatments` | on-demand (new) | three-year window on `application_date`, older on request |
| `applications` | on-demand (unchanged) | persisted with loaded Treatments |
| `application_batches` | on-demand (unchanged) | persisted with loaded Treatments |

The web matrix in `docs/sync.md` goes from 29 on-demand tables to 30. The mobile
row "Application batches: persisted with loaded applications" becomes "Chemical
Applications and batch links: persisted with loaded Treatments".

- **Shapes.** `treatments` is scoped by `organization_id = $org` like every other
  performed control action. The line shape keeps `organization_id = $org`.
- **Lines keep `organization_id`.** It stays `NOT NULL` and server-owned, set
  from the Treatment on write the way `application_batches` already copies its
  parent's. `SERVER_OWNED` and the client's `serverOwnedColumns` keep it
  (`check:server-owned-columns`). Electric subquery shapes were considered and
  rejected: no shape in the codebase uses one.
- **Client reads start from the Treatment.** Every collection-backed reader
  queries `treatments` and pulls lines through a correlated include on
  `applications.treatment_id`. The `applications` collection declares
  `createIndex((row) => row.treatment_id)`; without it the include scans local
  data and reads as "no lines". No query filters or sorts lines by a Treatment
  column, which would drop the pushdown and load every line in the Organization.
- **Readers that turn around.** `use-insecticide-usage`,
  `use-control-actions-for-day`, `use-day-activity` and `use-activity-strip`
  become "Treatments in the window, then their lines". The detail page loads the
  Treatment by id, then its lines filtered by `treatment_id`.
- **Server reads stay on the server.** The chemical Map and Table read
  `/map/chemical`, and the CSV export runs on the server, so the Insecticide
  filter is an `EXISTS` over live lines in SQL.
- **Confirmation.** `recordTreatment`, `recordTreatmentForMissionItem` and any
  save that includes `reviseTreatmentLines` go through `commandTransaction`,
  with optimistic rows in all three collections. The one txid from the command's
  transaction appears on every table it wrote, and `commandTransaction` waits on
  each collection the mutations touched, skipping any with no subscriber. So
  `{ treatment, txid }` covers lines arriving on another collection. A header-only
  PATCH waits on `treatments` alone. `MultiRowCommandType` gains the
  three-table create.

## Counts and lists

From #1739.

Counting work done counts Treatments. Counting a product counts lines.

These count Treatments, so a two-product catch basin job counts once:

- the overview and Period-in-review number (`overview.ts` counts `treatments`);
- the dashboard activity strip;
- the Daily Control Actions panel's per-person count and kind breakdown;
- people-today, day activity and daily work;
- the habitat history count and the inspection's linked-actions badge;
- the nearby and address-linked totals;
- profile activity;
- the chemical explorer's heading total, which agrees with the overview number
  that links to it;
- the explorer summary's method and applicator groupings.

These read lines:

- the Insecticide Usage panel's per-product count and amount;
- the explorer summary's Insecticide grouping;
- the amount breakdown, summed by Insecticide and unit.

The noun follows the thing counted. `RECORD_NOUNS` gains `treatment` (`one:
'treatment'`, `title: 'Treatment'`, and the plurals), and
`OVERVIEW_LABELS.applications` becomes Treatments. A per-product count keeps
"chemical applications", because the line is still a Chemical Application.
`check:record-nouns` holds the call sites.

Every list draws one row per Treatment, with its products listed in the row, and
selecting a row opens the Treatment:

- the explorer rail, table and map, one row and one feature per Treatment;
- Daily Control Actions rows;
- day activity, daily work and habitat history entries;
- the inspection's linked actions;
- nearby and address-linked rows;
- profile activity;
- mission stop provenance.

The Insecticide filter returns Treatments with any live line naming the product.

The CSV export stays one row per line. `/map/chemical/export` repeats the visit
columns on each product row and adds a Treatment ID column. Its row count exceeds
the explorer total by design, because state pesticide-use reports are per
product (#1738).

### Routes and labels

The routes stay under `/control-operations/chemical`, and `$id` is a Treatment
id. Because backfilled Treatments reuse their row's id, every existing detail
URL still resolves. The create entry reads **Record Treatment** under the
**Record** verb in `CREATE_VERBS`, the detail page is headed by the Treatment,
and the sidebar group stays **Chemical**. `CONTEXT.md`'s Create verbs list swaps
Chemical Application for Treatment. This follows from #1739's rule that the noun
follows the thing a surface shows, and is settled here rather than on the map;
`check:nav-labels` holds the create label.

## The web form

From #1743. The prototype is the `prototype/treatment-lines-form` branch
(throwaway, never merged); `?variant=D` on `/control-operations/chemical/create`
is the chosen layout, and `A` to `C` are the rejected ones.

### Layout

1. **Entry toggle.** "Product by product" or "From a formulation" replaces
   today's Product section. The visit facts (date, personnel, location, work
   performed, custom fields, first comment) stay where they are and are entered
   once.
2. **Product list.** A numbered list, one row per product: the Insecticide, then
   the amount and unit, then the batches. The footer reads "3 products", or "3
   products from 78 gal of Mix A" under a Formulation. "Saves as N chemical
   applications" goes, because a save writes one Treatment.
3. **Product by product.** The crew adds rows with "+ Product", picks each
   Insecticide, and enters the amount, unit and batches. Remove is disabled on
   the last live row, labelled "A treatment keeps at least one product".
4. **From a formulation.** The crew picks a Formulation and types the total mix
   applied. The form fills one row per component, and each row's product, amount
   and unit are read-only, derived from the recipe scaled to the mix total. Only
   the batches are editable. Nothing can be added or removed, and the footer
   reads "To add or drop a product, switch to product by product."
5. **Switching back** to product by product clears the Formulation, the mix
   amount and the mix unit, and keeps the rows as editable lines.

### Edit and refusals

6. **One PATCH.** The edit form sends one `commandTransaction` naming the header
   intents it touched and `reviseTreatmentLines` with the full line set, so the
   lines it shows are confirmed with the header.
7. **Removing a saved line** leaves it in the list, struck through, with "2 batch
   links go with it" and Keep, until Save. The revise asks for no
   acknowledgement, so this row is the only warning.
8. **Picking a different Formulation** on edit replaces the rows with the new
   recipe's. The old saved rows show as removed on save.
9. **A repeated Insecticide** is refused on the row: "X is already line 1. Put
   these batches on that line." A server 400 naming `applications.N.…` lands on
   row N+1.
10. **Opening a Formulation Treatment for edit** shows the saved lines, not a
    recomputation. Changing the mix amount recomputes the rows from the current
    recipe, which is what the recipe check then compares against.

Item 10 is not in #1743; it follows from the batch-only rule in
[When the recipe check runs](#when-the-recipe-check-runs).

Today's form loop over separate creates, and its partial-failure handling, are
deleted. The create is one command.

## The migration

From #1742.

### Facts it rests on

- `railway-deploy.yml` migrates first, then deploys server, web and admin, so the
  old server runs for a few minutes against the new schema. `apps/web` has no
  stale-bundle reload.
- The only foreign key into `applications` is `application_batches.application_id`.
  Comments and Additional Personnel name a Chemical Application by
  `entity_type = 'application'` and `entity_id`. An update to
  `comments.entity_type` fires `comments_search_document_update`, so comment
  search documents refresh themselves.
- `drop column` does not rewrite the table and emits no logical decoding
  traffic. The backfill emits one insert and one update per row in one
  transaction, which is the reorder-buffer cost that killed the slot in #166 and
  #236.
- No existing row breaks a new rule. Each row backfills its own Treatment with
  one line, so the one-line-per-Insecticide and at-least-one-line rules hold,
  `geom` is already `NOT NULL`, and the composite key holds because the Treatment
  takes the row's `organization_id`. `metadata` moves over as it is and is not
  checked again against the method's `custom_schema`.

### One migration, one cutover

A single migration:

1. creates `treatments` with its constraints, the centroid trigger and the
   unique index on `(id, organization_id)`;
2. inserts one Treatment per `applications` row, reusing the row's `id` and
   copying its `organization_id`, visit columns, `metadata`, `geom` and all six
   audit columns, with the three Formulation columns null;
3. adds `applications.treatment_id`, sets it to the row's own id, and makes it
   `NOT NULL`, leaving `applications.updated_at` alone;
4. updates `comments` and `additional_personnel` from `entity_type =
   'application'` to `'treatment'`, keeping `entity_id`;
5. adds the composite foreign key, the partial unique index on
   `(treatment_id, insecticide_id)`, the index on `treatment_id`, and moves the
   visit-column indexes to `treatments`;
6. widens `tags_relevant_entity_types_known` to allow `'treatment'`;
7. drops the moved columns, the geometry CHECK and the `applications_centroid`
   trigger from `applications`;
8. ends with `analyze` on both tables.

A soft-deleted row becomes a soft-deleted Treatment with a soft-deleted line.
Electric drops shapes whose columns changed, so clients load fresh data.

Expand and contract was rejected. Its dual-write layer would be thrown away
after one release, and old-server writes during the deploy would arrive silently
with no Treatment. Under one cutover, the old server's chemical writes fail
loudly for the minutes the deploy takes, and old tabs see shape errors until they
reload.

`control_type = 'application'` stays. It names the kind of work on missions and
Requested Control Actions, not the table, and so does `CONTROL_TYPE_FOR_KIND`.

### The slot is measured before merge

The migration runs against the local production clone
(`scripts/clone-prod-db.ps1`) with a logical slot attached, and the PR that
merges `feat/treatments` into `develop` records
`pg_stat_replication_slots.total_bytes` in this section. One transaction is the
default. If the number gets anywhere near the 1 GB limit, the backfill splits
into its own later migration.

Measured: not yet. The build fills this in.

## Registers and gates

Each of these names `applications` or `'application'` today and changes in the
build. The full reader and writer inventory, with file and line for each, is
`docs/research/applications-inventory.md` on the `research/applications-inventory`
branch (#1737).

| Register | Change | Gate |
|---|---|---|
| `OWNED_GEOMETRY_POLICIES` | the `controlAction` row names `treatments` in place of `applications`; still 15 tables | `check:geometry-policies` |
| `MAP_SURFACES`, tile bindings | the chemical surface reads `treatments` | `check:tileset-keys` |
| `REGION_MEMBERSHIP_RECORD_TYPES`, `regionMembershipClauses` | read `treatments` | |
| `COMMAND_PERMISSIONS` | six new names, seven retired, OWN_TREATMENT, DELETE_OWN_TREATMENT | `check:write-surfaces` |
| `WRITE_SURFACE_FLOORS` | `treatments` in, `applications` and `application_batches` out | `check:write-surfaces` |
| `ACKNOWLEDGEMENT_MECHANISMS` | `acknowledgedBatchClearance` out | `check:acknowledgements` |
| `DeletableRecordType`, deletion registry | `application` becomes `treatment` | |
| comment and personnel targets, `CommentTargetType` | `application` becomes `treatment` | |
| search comment destinations | a comment on a Treatment opens the Treatment | |
| `RECORD_NOUNS` | `treatment` added | `check:record-nouns` |
| `CREATE_VERBS`, navigation | Record Treatment | `check:nav-labels` |
| activity categories | the chemical category counts Treatments | |
| `MultiRowCommandType` | the three-table create | |
| `SERVER_OWNED`, `serverOwnedColumns` | `applications.organization_id` stays server-owned; `treatments` columns added | `check:server-owned-columns` |
| row schemas, collection factories | `treatments` generated; `applications` loses its visit fields | `check:schemas`, `check:table-types` |
| mutation suites | `use-treatment-mutations` replaces `use-application-mutations` | `check:mutation-coverage` |
| the mission stop's "closed by" wording | names a Treatment | |

Applications are not in the search corpus, and Treatments do not join it in this
effort.

## Documents that change with the build

- `docs/control-operations-domain.md`: the Chemical Application commands and
  section are rewritten for Treatment and its lines; the Formulations and
  Formulation helpers sections lose the not-stored rule and
  `expandFormulationApplicationCommands`; the permissions section names
  OWN_TREATMENT; the mobile created-row ids gain `treatmentId`.
- `docs/sync.md`: the `treatments` row and the mobile row above.
- `docs/dashboard-spec.md`: the untreated section.
- `docs/domain-command-contract.md`: the vocabulary count, and `treatments` as
  the example of a revise that carries a whole child set.
- `docs/web-components.md` and `docs/web-hooks.md`: one heading per new or
  renamed component and hook.

## Mobile

Mobile records no Chemical Applications today, and its recording UI is out of
scope. The one rule this spec sets for it: a Treatment and its lines are one
replay-safe command. `recordTreatment` and a PATCH carrying
`reviseTreatmentLines` are each one queued command, and a refused one holds back
the queued commands that name the same Treatment.

## Build order

All of it lands on the integration branch `feat/treatments`. Sub-PRs merge into
it, and it merges to `develop` once, with one changeset against `apps/web`. Each
slice below is one issue.

1. **Migration and generated types.** The migration above, `pnpm db:migrate`,
   `pnpm generate:table-types`, `pnpm generate:schemas`, the row schema prose,
   the `OWNED_GEOMETRY_POLICIES` and server-owned column changes. Integration
   suites for the backfill: id reuse, audit copy, soft-deleted rows, support
   record re-pointing, the composite key refusing a mismatch.
2. **Domain builders.** `recordTreatment`, `recordTreatmentForMissionItem`,
   `updateTreatmentFieldDetails`, `updateTreatmentLocationAndContext`,
   `reviseTreatmentLines`, `deleteTreatment` in `packages/domain`, with the
   repeated-Insecticide refusal and the Formulation set validation.
   `expandFormulationApplicationCommands` deleted.
3. **Server commands.** `/commands/treatments`, the writers, the diff, the
   recipe check, the batch-matches-line check, the floors, the deletion registry,
   the acknowledgement removal, and retiring the two old surfaces.
4. **Server readers.** Untreated, region membership, mission geometry coverage,
   the mission action unions, both merges, overview counts, `/map/chemical` and
   its tiles, nearby, address-linked, profile activity, the export.
5. **Web read seam.** Split `PERFORMED_ACTIONS.applications.measured()` in
   `apps/web/src/hooks/queries/performed-action-reads.ts` into the Treatment and
   its lines; the `applications` index on `treatment_id`; the four readers that
   turn around; the one-row-per-Treatment lists.
6. **Web form and detail page.** The layout and refusals above, the detail page
   and its danger zone, `RECORD_NOUNS`, the create label.
7. **Docs.** The documents listed above, and the slot measurement recorded here.

Slices 2 and 3 can run beside 4 and 5 once slice 1 has merged into the
integration branch. Slice 6 needs 3 and 5.

## Conflicts and gaps settled in this document

- **Lines and the Formulation.** #1736 decision 4 let lines and the reference be
  edited independently, with the lines winning on disagreement. #1743 reversed
  it: while a Treatment names a Formulation, its lines are the recipe. The later
  ticket wins, and the glossary sentence "they are the source of truth when the
  two disagree" goes.
- **The untreated live-line check.** #1735 said the predicate needs a live-line
  check if a Treatment could have no lines. #1734 settled that it cannot, so the
  predicate reads `treatments` alone.
- **Batch-only revises skip the recipe check.** Settled here, under
  [When the recipe check runs](#when-the-recipe-check-runs).
- **The edit form shows saved lines.** Settled here, item 10 under
  [The web form](#the-web-form).
- **Routes and the create label.** Settled here, under
  [Routes and labels](#routes-and-labels).
- **`OWN_APPLICATION_VIA_BATCH`.** #1737 flagged that it would need two hops.
  #1740 retired the batch commands, so the floor goes and `through` stays one hop.

## Out of scope

- Source Reduction, Biocontrol Action and Outreach Action under a shared event.
  Reopen as a new effort if a crew records two kinds of control in one visit.
- Mobile recording UI.
- A separate "uncontrolled" state for Source Reduction and Biocontrol.
- Treatments in the search corpus.
