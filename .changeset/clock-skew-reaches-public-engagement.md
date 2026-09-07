---
'@simmer-mosquito/web': patch
---

Fixed: closing or reopening a Service Request no longer fails because your
computer's clock is a little fast. The moment the browser stamps on the write
was compared against the server's own clock with nothing allowed either way, so
a machine running more than two seconds ahead had Close and Reopen refused as
being in the future, with a message that gave no hint the clock was the reason.
Marking a Mission Notification complete, failed, skipped or reopened refused for
the same reason.

Every other command in the product already allowed two minutes of ordinary
device drift. Public engagement was the one place still holding a second copy of
that rule, written before the allowance existed, and it now runs the same one.
