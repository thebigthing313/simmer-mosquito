---
'@simmer-mosquito/web': patch
---

Fixed: importing a geometry from a file now counts one skipped shape in the
singular. A file holding a single geometry this record cannot store used to read
"1 other geometries were ignored", and it read that in both places the shape
list says it, the sentence shown when nothing in the file is usable and the line
beside the file name when something is. The badge next to that line had
pluralised its own noun all along, so the two disagreed on the same screen.
