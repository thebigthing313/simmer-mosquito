---
'@simmer-mosquito/web': patch
---

Fixed: A trap's Collections tab and the trap directory count a collection's species and mosquitoes the same way, from its females. Males are no longer counted, a species with a female and a male row counts once, and unidentified mosquitoes add to the mosquito count but not to species. In the directory the line reads "N species · M mosquitoes", and a collection of males alone reads "Not identified".
