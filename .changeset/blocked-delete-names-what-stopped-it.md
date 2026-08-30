---
'@simmer-mosquito/web': patch
---

Fixed: A delete that is refused now lists what still references the record. The refusal already carried that list and the danger zone was dropping it, so the card said only that the delete failed.
