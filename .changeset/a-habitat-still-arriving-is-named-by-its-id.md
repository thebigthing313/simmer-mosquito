---
'@simmer-mosquito/web': patch
---

Fixed: a habitat whose row has not arrived yet is named `Habitat` and the first
eight characters of its id, rather than a bare comma. Habitats stream on demand,
so for a moment after an inspection arrives its habitat has not, and five
surfaces titled the record with the separator of a name built from nothing: the
inspections table, the inspection map card, the sample map card, and the two
panels on the larval overview, Daily Inspections and Heavy & Very Heavy. A
habitat that has arrived with no name still reads its coordinates, and
an inspection at no habitat still reads its own coordinates or its address. The
sample map card also showed the comma while the sample's inspection itself was
still arriving, and reads `Ad-hoc sample` there until it lands.
