---
'@simmer-mosquito/web': patch
---

Fixed: A form that cannot be saved now says why in its alert. Problems the record's own rules catch but no single field owns, such as a region saved without a boundary drawn, read "Unable to save changes." instead of the actual reason.
