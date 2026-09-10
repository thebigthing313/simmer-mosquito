---
'@simmer-mosquito/web': patch
---

Fixed: The habitat form now takes down the "draw the habitat geometry" refusal
when you pick an address, the way every other located record's form does. Where
the address had not yet synced a point of its own, the refusal stayed on screen
after the pick.
