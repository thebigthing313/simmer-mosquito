---
'@simmer-mosquito/web': minor
---

Changed: the Traps, Collections, Chemical, Source reduction, Biocontrol and Outreach rails now list the records inside the viewport, the way Habitats, Inspections and Samples already did. Each of the six read the whole Organization, 50 rows at a time in date order, while the map beside it drew one box, so a record in the rail was often nowhere on screen and a record on screen was often not in the rail. The count reads "n in view" on all nine, and an empty rail says to pan or zoom as well as to loosen the filters. Date filters are unchanged and still filter.
