---
'@simmer-mosquito/admin': minor
---

Changed: an operator console form that will not save now says which field is
missing. Nine of the eleven forms greyed Save out while something was empty,
which told you nothing about what, and the two that needed a shape on a map went
further: pressing Add did nothing at all and said nothing about why. Genera,
species, units, and the six foundation forms name the missing part instead, and
a region or an address without a location asks for one.

Changed: a refused save on a global catalog form reads as an alert above the
fields rather than a line of red text under them, and it carries the server's own
words. Save comes back as soon as you change something.

Changed: the Genus, Folder, Lure, Address, Species, Measures, and System pickers
in the console are the same select the rest of SIMMER uses, and a required field
is marked in its label. Nothing about what they store changed.
