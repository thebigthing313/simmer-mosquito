---
'@simmer-mosquito/web': patch
---

Fixed: A route or worklist map now redraws a stop whose shape has moved. The
layer decided whether to rebuild from a signature carrying each stop's shape
type and vertex count and not its coordinates, so a shape edited into a new
position with the same number of vertices left the map drawing the old one, and
the stop stayed where it was until something else about the route changed. The
key is now the stops themselves.
