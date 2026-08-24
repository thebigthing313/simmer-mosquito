---
'@simmer-mosquito/web': patch
---

Changed: Filtering a map by Region now counts an area record as inside a district only when the two overlap, rather than when they merely share a boundary. A habitat polygon that sits alongside a district and shares an edge with it used to come back in that district's filter; it is work next to the district, not in it. Points and lines are unaffected, and neither are traps, adult collections or addresses, which are always points. Habitats, inspections, chemical applications, source reductions, biocontrol actions and outreach actions can all answer differently, so a saved district filter may show a different count than it did.
