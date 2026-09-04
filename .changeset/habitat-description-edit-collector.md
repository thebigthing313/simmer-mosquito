---
'@simmer-mosquito/web': patch
---

Fixed: editing a habitat without redrawing its shape no longer sends a location
change, so a collector can now save a correction to a habitat's name,
description, or metadata. The form decided the shape had moved by comparing two
serialised copies of it, and a difference in key order was enough to make the
save ask for a permission collectors do not have.
