---
'@simmer-mosquito/web': patch
---

Fixed: An inspection with no habitat or address is titled by its coordinates in a service request's nearby list and in a person's activity, where it used to read "Inspection". Every other kind of record in those rows does the same when nothing else names it, and a collection taken away from a trap reads its address there before its coordinates.
