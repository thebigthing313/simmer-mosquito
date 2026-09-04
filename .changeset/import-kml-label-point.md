---
'@simmer-mosquito/web': patch
---

Fixed: a KML placemark carrying a label point beside its shape imports again, as
that shape, with the row saying the label point was dropped. It was refused as
mixed geometry. A placemark mixing an area with a line, or holding several points
beside a shape, is still refused.
