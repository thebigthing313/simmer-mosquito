---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: Inviting somebody no longer fails on a brief database blip after the mail has gone out; the last step is retried.
