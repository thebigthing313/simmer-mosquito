---
'@simmer-mosquito/web': patch
---

Fixed: The Species column on a trap's Collections tab counts the distinct species among the females, the same mosquitoes the Mosquitoes column counts. It no longer counts males, counts a species twice when it has a female and a male row, or counts unidentified mosquitoes as a species, so a collection of males reads 0 species and 0 mosquitoes.
