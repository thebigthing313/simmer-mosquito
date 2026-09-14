---
'@simmer-mosquito/web': patch
---

Changed: a record's facts card no longer reads back what the map beside it
draws. The Geometry and Coordinates rows on the habitat, and the Coordinates
row on the inspection and the sample, are gone. The Location card's own line
carries the numbers, so a one-vertex shape reads `Point · 40.59749, -74.24462`
where it used to read `Point · 1 vertex`, which was the same sentence for every
point in the product.

Changed: the larval inspection's measurements read in its Details card, where
the rest of its facts are. Density, life stages, larvae and dips came down out
of the header, which keeps the two flags it derives from them: wet or dry, and
larvae found or none. The dip count still carries the per-dip rate beside it.

Changed: an inspection with no Habitat linked says so with the same mark every
other missing value uses, rather than repeating the coordinates already in its
subtitle and on its map.

Changed: a missing value in a facts card is one em dash, on every card. Rows
had picked thirteen ways to say nothing, several of them on one card, so a
reader scanning a column of labels for what is missing had to read sentences
one at a time. Screen readers still hear "Not recorded".

Changed: a record titled by its date writes the month out. An adult collection
reads "August 20, 2026" rather than "8/20/2026", matching the inspection page,
and its breadcrumb reads "Collection · Aug 20, 2026".

Changed: a record's Tags read once. The habitat's facts card had a Tags row
while the header above it drew the same Tags, so a tagged habitat said them
twice on one screen.

Changed: source reduction takes a struck-through droplet. It had been carrying
the same glyph as Delete, which the habitat menu put four rows away from it.
