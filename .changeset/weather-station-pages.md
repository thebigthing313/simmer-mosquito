---
'@simmer-mosquito/web': minor
---

Changed: a weather station's summaries are listed a year at a time, one tab per
year the station has readings in, newest first. A station logged daily for ten
years put 3,650 rows in one table. Recording or editing a reading dated in
another year moves the tabs to that year, so the reading you just saved is the
one on screen.

Added: the import screen names the column headings it reads before you choose a
file, and marks the date column as the one it cannot do without. The headings
come from the same list the parser matches against.

Changed: the weather explorer filters by status, opening on active stations, and
paints each station on the map by its status with a key beside it. The Active
and Inactive pill has gone from the rows; the dot is the status now. This is the
shape the Traps map already had.

Changed: the Weather group's map is labelled "Map", matching every other map in
the sidebar. The group heading above it already reads "Weather".
