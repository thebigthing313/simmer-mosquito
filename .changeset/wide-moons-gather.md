---
'@simmer-mosquito/web': minor
---

Added: Weather stations can now be managed and their readings recorded. Add a station by placing it on the map, edit its name, code or location, retire it when it stops reporting, and delete it when it is gone for good. Each station's readings can be entered by hand — one day or a stretch of days, with temperature, precipitation, humidity and wind — or loaded in bulk from a CSV or Excel file, which is checked against the station's existing readings and reports what it added, updated, left alone and could not write. Managing weather is a manager-and-above job; collectors and viewers read it as before.

Renaming a station relabels every reading ever taken there, and moving one relocates all of them, because a reading records neither the station's name nor where it stood. Both now ask before they do it, and so does deleting a station, which takes its readings with it.
