---
'@simmer-mosquito/web': patch
---

Changed: the records shown near a Service Request run to the day it was closed,
or to today while it is still open. The window used to end a fixed number of
days after the request date, 14 by default, so a request that stayed open for
six weeks showed two weeks of what happened after it and nothing of the work
that closed it. The setting is now a floor on the window's end rather than the
end: a request closed inside it still shows the same window, and one closed
later shows through its close day. Both days are the Organization's calendar
days, and the start of the window is unchanged.
