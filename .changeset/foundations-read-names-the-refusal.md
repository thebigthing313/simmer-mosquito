---
'@simmer-mosquito/admin': patch
---

Fixed: a refused Foundations read now says what the console says everywhere
else, and says it at once.

The page reached the server on its own rather than through the console's one
request path, so the server's refusal code was dropped on the floor and three
things went wrong on that page and no other.

An operator on a server with no SIMMER_OPERATOR_ORG_ID got a red "Could Not
Load" box reading "operator not configured". That names nothing anyone can act
on. It is the Server Not Configured screen now, which names the variable to set
and the service to set it on, the same screen the organizations list and the
members list have always shown.

A 403 or a 404 was retried three times with backoff before anything appeared, so
the page spun for about six seconds and then explained itself. A refusal is an
answer, so it now draws immediately.

The message read "operator required" here and "operator_required" on every other
page, off one server payload. One function writes it now, so the two agree.
