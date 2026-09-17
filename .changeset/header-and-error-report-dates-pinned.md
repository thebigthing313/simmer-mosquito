---
'@simmer-mosquito/web': patch
---

Fixed: the date in the header and the time on an error report read the same on every machine. Both took their wording from the browser's locale, so the same day could read `Wed, Mar 4, 2026` on one screen and `Wed 4 Mar 2026` on the next.
