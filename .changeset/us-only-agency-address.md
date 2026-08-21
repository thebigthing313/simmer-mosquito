---
'@simmer-mosquito/web': patch
---

Fixed: An agency address is refused if its country is anything but US, the same way its state already was. The form only ever sent US, so nothing on screen changes.
