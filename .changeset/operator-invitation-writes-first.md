---
'@simmer-mosquito/admin': patch
---

Fixed: A failed invitation from the operator console no longer mails a sign-in link the agency has no record of. The invitation used to go out before the person was added, so an address that could not be invited got a working link while the invite came back as an error.
