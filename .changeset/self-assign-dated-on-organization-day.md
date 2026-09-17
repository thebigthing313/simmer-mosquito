---
'@simmer-mosquito/web': patch
---

Fixed: a Collector who picks up a route from the worklist gets the assignment dated on the Organization's calendar day. It was dated on the UTC day, so a route picked up in the evening was filed under tomorrow.
