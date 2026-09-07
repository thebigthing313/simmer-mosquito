---
'@simmer-mosquito/web': patch
---

Fixed: an edit page whose read failed now says so and tells you to try again,
instead of saying the record could not be found. Six of them drew the "no such
record" state whatever had happened: weather stations, missions, requests for
control, assignments, trap routes and habitat routes. On those, a dropped
connection looked like a record somebody had deleted, so the answer was to stop
looking rather than to try again.

Changed: a trap route, a habitat route and an assignment stand behind a
placeholder while they load, rather than drawing an empty worklist, and say why
they are unavailable in the same words every other record page uses.
