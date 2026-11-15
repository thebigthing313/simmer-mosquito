# 20. A Treatment holds the visit, and each Chemical Application is one product

Date: 2026-11-15

## Status

Accepted, not built. `docs/treatment-spec.md` is what gets built. Settled on the
map in #1733, whose tickets hold the reasoning and the rejected alternatives.

## Context

`applications` holds one Insecticide per row, with the visit on the same row:
date, applicator, method, vehicle, equipment, geometry, address, the Habitat,
Inspection, Collection, Mission Item and Requested Control Action links, and the
method's custom fields. A crew that puts two products down in one visit saves two
rows that repeat every visit fact. A catch basin mission has nowhere to keep the
visit's own data, the total basins and how many were dry or wet, and every count
reads the two rows as two jobs.

The Formulation path already writes one visit as N rows.
`expandFormulationApplicationCommands` repeats every visit field, comment and
personnel row on each, and the form handles a partial failure when one of the
creates is refused. `CONTEXT.md` said a Formulation is not stored as historical
source data, because there was no row to store it on.

Pesticide-use reporting keys a record to the application and names each product
inside it (#1738). Product, EPA registration number and amount are per product.
Date, applicator, location, area and method are once per application. No rule
read asks for a location per product.

## Decision

**A Treatment is the visit.** A new table, `treatments`, holds what the visit
shares, including the geometry and the method's custom fields. `applications`
keeps its name and ids and becomes the line: one Insecticide, one amount, one
unit, and its batch links. The name follows the industry, where "treated" means
insecticide went down.

**Every Chemical Application belongs to a Treatment.** A one-product job is a
Treatment with one line. A Treatment holds at least one live line, and at most
one live line per Insecticide, backed by a partial unique index. Removing the
last line is refused; the crew deletes the Treatment.

**A line has no place, date or counts of its own.** Products that went to
visibly different places are two Treatments. This is what reporting asks for,
and it keeps every visit-level reader on one table.

**Writes go through the Treatment.** `/commands/treatments` carries every write.
`reviseTreatmentLines` sends the whole line set and the server diffs it, so the
line rules are checked against the result and a header-and-lines save is one
replay-safe request. The line and batch tables accept no commands.

**Only a Treatment clears untreated.** A Source Reduction or Biocontrol Action no
longer takes a Habitat off the untreated list. "Treated" means insecticide work.

**A Treatment may name the Formulation it was mixed from.** It stores the
reference and the mix amount, not a copy of the recipe. While it names one, its
lines are the recipe scaled to the mix amount, checked by the server on write. A
crew that used something else records it product by product.

**Lines keep their own `organization_id`**, held to the Treatment's by a
composite foreign key, so the line shape stays a plain `organization_id = $org`
filter. Client reads start from the Treatment and include lines on an indexed
`treatment_id`.

**One migration, one cutover.** Each existing row backfills its own Treatment,
reusing the row's id, so support records change only their `entity_type` and
every detail URL still resolves. The code lands through one integration branch.

## Consequences

- Counts of work done count Treatments, and per-product figures read lines. A
  two-product job counts once in the overview and twice in Insecticide Usage. The
  CSV export stays one row per line, with a Treatment ID column, so its row count
  exceeds the explorer total by design.
- A drained or stocked Habitat stays untreated until a later inspection comes
  back lower or the reading ages out of the window. Nothing reads an
  "uncontrolled" state for non-chemical work, so none is added.
- `applications` is the first table with a composite foreign key. It is there
  because a denormalized copy that drifts would put a line in another
  Organization's shape.
- The deploy migrates before the new server is up, so for a few minutes the old
  server's chemical writes fail and old tabs see shape errors until they reload.
  Expand and contract would have hidden those writes instead, arriving with no
  Treatment.
- The backfill is one insert and one update per row in one transaction, the cost
  that broke the replication slot in #166 and #236. It is measured on the
  production clone before merge, and splits into its own migration if it nears
  the limit.
- `acknowledgedBatchClearance` and `OWN_APPLICATION_VIA_BATCH` leave. The form's
  struck-through row is the only warning that removing a line takes its batch
  links.
- Treatments become a tag target, which applications never were.
- A recipe edited after a Treatment was saved changes nothing saved. A later
  edit that changes the Treatment's products or mix amount is checked against
  the current recipe.
- Source Reduction, Biocontrol Action and Outreach Action keep one row per
  action. If a crew needs two kinds of control under one visit, that is a new
  decision.
