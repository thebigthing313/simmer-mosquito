---
'@simmer-mosquito/web': patch
---

Changed: Filtering a map by Region now counts an area record as inside a district only when the two overlap, rather than when they merely share a boundary. A habitat polygon that sits alongside a district and shares an edge with it used to come back in that district's filter; it is work next to the district, not in it. Points and lines are unaffected, and so are traps, adult collections and addresses, which are always points. Habitats, inspections, chemical applications, source reductions, biocontrol actions and outreach actions can all answer differently. Measured against production before it shipped: of every area record in the six tables, nine chemical applications fall inside a region and none of them change, so no saved district filter returns a different record today.
