---
'@simmer-mosquito/web': minor
---

Changed: importing a file now makes one record per feature. A park on three
separated lots comes in as one Region with three pieces, instead of three
Regions named "Park A (1)", "Park A (2)" and "Park A (3)". Each preview row says
how many pieces the feature holds and how many vertices, the preview map frames
a multipart feature rather than failing to fit, and the 1000-feature cap now
counts features, so the same number buys more file. A feature holding one lot
imports as a plain area, exactly as before.

Changed: the "Fill from File" shortcut on a record form now offers every shape
that record can store, rather than only the shape the type toggle is on, and
adopting one moves the toggle onto it. A record that takes areas and lines alike
reads "Import a Geometry"; a Region import still reads "Import a Polygon".

Changed: both import surfaces now say what they found and are not offering. A
feature whose pieces the record cannot store, and a feature mixing geometry
kinds, each get a line saying so instead of going missing without a word. A
GeoJSON GeometryCollection is refused by name rather than dissolved into
whichever shape came first.

Fixed: filling a record's area from a Region boundary no longer refuses a Region
drawn in separate pieces. It comes across whole wherever the record can store
it, and is refused by name on a Notification Registration, which holds one area.

Nothing is backfilled. An agency that already imported a multi-lot file holds
one Region per lot, and re-importing that file now produces one Region per
feature beside them.
