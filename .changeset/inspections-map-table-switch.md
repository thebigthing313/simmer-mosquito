---
'@simmer-mosquito/web': patch
---

Fixed: moving between the Inspections Map and Table keeps the filters. Both
surfaces now draw a Map/Table switch, and it carries what you have narrowed to
with it. The switch carries the shared filters and not the table's sort, which
the map has nothing to sort by. The sidebar's Map and Table links are unchanged
and still open each surface on its own defaults.
