---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Changed: When a saved record is slow to show up, the form now waits up to 15 seconds for it before moving on, up from 5. The save is kept either way.
