---
'@simmer-mosquito/web': minor
---

Added: draw a record's geometry in several pieces. Add piece draws one more
piece of the shape you already have, and the shape you drew first stays on the
map while you place it. At two pieces the location panel lists them, and a row
hovers to pick its piece out, clicks to frame it, and removes it. Removing the
second-to-last piece puts the record back on a single shape. Redraw geometry
still takes every piece.

Changed: a form with nothing drawn yet opens on the area tool wherever the
record can hold an area. Habitats, Inspections, the four control actions,
Requested Control Actions and Mission Items opened on the point tool, so drawing
the area started with a tool change.

Changed: an edit form now opens a record whose geometry is already in several
pieces, instead of showing it as no geometry and keeping what was stored unless
you redrew the whole thing.
