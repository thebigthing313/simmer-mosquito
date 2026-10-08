---
'@simmer-mosquito/web': patch
---

Changed: When sync is slow, a save now waits up to 15 seconds for the saved record to come back before the form moves on, up from 5. The save itself is unchanged: it is kept either way.
