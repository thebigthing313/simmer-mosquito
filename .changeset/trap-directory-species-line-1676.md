---
'@simmer-mosquito/web': patch
---

Fixed: A collection's line in the trap directory reads the same species and mosquito numbers as the trap's Collections tab, as "N species · M mosquitoes". It no longer counts males, and unidentified mosquitoes add to the mosquito count but not to species. A collection of males alone reads "Not identified".
