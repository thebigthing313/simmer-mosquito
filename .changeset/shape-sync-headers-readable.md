---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: The workspace loads again. Every synced table was arriving empty because the browser could not read the headers that tell it where a sync stream is, so the app reported that it could not find your agency.
