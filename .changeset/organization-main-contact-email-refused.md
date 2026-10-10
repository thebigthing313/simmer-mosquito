---
'@simmer-mosquito/web': patch
---

Fixed: saving an Organization's details with a Main contact that is not an email address is now refused by the server as well as by the My Organization form, so a request that skips the form can no longer store one.
