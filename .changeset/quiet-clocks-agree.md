---
'@simmer-mosquito/web': patch
---

Fixed: Dates and times across the app now read in the Agency's timezone rather than in the browser's or the database server's. A mosquito control agency's day is a local operational day, so a trap placed at 9pm, a collection emptied before dawn, and an application logged at the end of a shift belong to the day the crew worked. Previously a supervisor in one timezone and a collector in another saw different answers on the same page, and at the edge of a date range an evening's work was not merely shown on the wrong day — it was outside the window that had been asked for, so it disappeared. This covers the day every page treats as "today", the date every new record is stamped with, every rendered time of day, the year a trap's collections are filed under, and the windows the collections explorer and the service-request nearby view filter by. Daylight saving is resolved at the moment in question, so a window is not an hour off for half the season.

Fixed: An inspection date, an application date, and a mission's rain date read as the day before wherever the browser sits west of Greenwich. They are calendar days rather than moments, and are now rendered as the days they are.
