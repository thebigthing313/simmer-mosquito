---
'@simmer-mosquito/web': patch
---

Added: the three panels on the Operations overview say when their read failed.
Open Requests for Control, Active Assignments and Scheduled Missions used to
draw the loading placeholder for as long as a failed read stayed failed, with
nothing on screen to tell that apart from a slow one. Each now reads
"Requests are unavailable right now.", "Assignments are unavailable right
now." or "Missions are unavailable right now.", the way the panels on the other
four overviews do. The empty sentences and the rows are unchanged.
