---
'@simmer-mosquito/web': patch
---

Fixed: A failed invitation no longer mails a sign-in link the agency has no record of. The invitation used to go out before the person was added, so an address that could not be invited got a working link while the invite came back as an error. Inviting somebody who already has access now says so instead of failing.
