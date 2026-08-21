---
'@simmer-mosquito/web': patch
---

Fixed: Deleting an insecticide, vehicle, method, or other catalog entry is now refused while anything still uses it, and the confirmation names what. Deleting one used to succeed and leave those records pointing at an entry that was gone.
