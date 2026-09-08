# Sorting a table by a vocabulary column

A windowed table does not get a sortable header for a Postgres enum column.
Density on the Inspections table is the case that came up, and the answer covers
the other fifteen enum columns too: sort by dates and numbers, filter by
vocabulary.

## Why this is out of scope

Sorting a window over an on-demand collection has two halves that have to agree
on the order, and neither half can be told what the order is.

Postgres orders `larval_density` by the type's own order, `none` through
`very_heavy`, which is what `COLUMN_VOCABULARIES` declares and what the density
legend and the map ramp read. The browser re-sorts the window it was sent, and
`ascComparator` in `@tanstack/db` compares two strings with `localeCompare`,
which gives `heavy, light, medium, none, very_heavy`. `OrderByOptions` is
`{direction, nulls}` and a string collation, so there is nowhere to hand it the
right comparator.

Two halves disagreeing is worse than a wrong-looking column. The cursor for the
next window is built from the browser's order and read back by Postgres, so the
table would show a window in the wrong order and then page past rows it never
asked for.

Pushing a `case` expression down does not fix it, and fails quietly. In
`@tanstack/db`, `query/compiler/order-by.js` gates the whole lazy-loading path
on the first `orderBy` expression being a `ref`. A `case` is a `func`, so it
takes the other arm: no index lookup, no cursor, and none of the
`orderBy with limit requires an index` warning that the sort-key loop in
`use-inspection-table.test.tsx` asserts on. The header would work on a seeded
test database and load an organization's whole inspection history in the field.

That leaves one mechanism that works: a sortable number on the row, so both
halves compare integers. It costs more than the header is worth.

- A migration on `inspections`, plus `pnpm db:migrate` and
  `pnpm generate:table-types`.
- A trigger rather than a generated column. Postgres logical replication does
  not publish `GENERATED` columns, which is why `lat`, `lng` and `geom_type`
  stopped being generated in `202607070001_sync_owned_centroid_columns.sql`. A
  generated rank would sort correctly in Postgres and never reach a browser.
- A new streamed column, so every client re-snapshots `inspections`.
- A second declaration of the order, living in SQL, that
  `check:column-vocabularies` would have to grow a case for. The register exists
  because Larval Density was written out in thirteen places (#432) and a rank is
  a fourteenth.

## What the reader does instead

Filter. `InspectionTableFilters` already carries `densities`, and the predicate
is `inArray(inspection.density, [...])` on a column of `inspections`, so it
pushes down into the shape request and narrows the window server-side with the
cursor intact. A reader looking for the heavy sites asks for the heavy sites.
Sorting five bands puts the same rows on screen in a worse order, because
`created_at` is then the only thing separating a few thousand `medium` rows.

## What this does not cover

Sorting by a date or a number stays in scope, and #487 built four of those.
Reading the band order off `COLUMN_VOCABULARIES` stays the way the legend, the
density select and the map ramp get it.

If a surface ever needs a vocabulary column ordered for some reason other than a
table header, this file is about the header, not about the idea of a rank.
Reopen the question then, with that surface as the case.

## Prior requests

- #514 "Sorting the Inspections table by Density needs a rank on the row"
