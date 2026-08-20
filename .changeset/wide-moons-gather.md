---
'@simmer-mosquito/web': minor
---

Added: Weather stations can now be managed and their readings recorded. Add a station by placing it on the map, edit its name, code or location, retire it when it stops reporting, and delete it when it is gone for good.

Readings can be entered by hand, covering one day or a stretch of days, with temperature, precipitation, humidity and wind. They can also be loaded in bulk from a CSV or Excel file. Before anything is written the upload shows what each line would do against the readings the station already holds, so a line that would overwrite one is visible before you commit rather than after. Managing weather is a manager-and-above job; collectors and viewers read it as before.

Renaming a station relabels every reading ever taken there, and moving one relocates all of them, because a reading records neither the station's name nor where it stood. Both now ask before they do it, and so does deleting a station, which takes its readings with it.
