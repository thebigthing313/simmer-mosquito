---
"@simmer-mosquito/web": patch
---

Changed: the Dashboard leads with the last-7-days strip, which now counts off the synced tables and moves as records sync rather than on a five-minute refresh, draws every activity type, at 0 where the Organization has recorded none, and states each change with a chevron and a count-or-percent toggle. In the field today and the Activity Monitor read the same synced rows, so both move as a record syncs, and a day on the Monitor is never cut short at 2,000 entries. The untreated habitats banner is gone from the Dashboard; the habitats explorer's untreated filter still answers the question.
