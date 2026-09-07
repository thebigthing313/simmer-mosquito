---
'@simmer-mosquito/web': patch
---

Fixed: selection is one colour on every map. A selected record wore an amber
halo on the explorer layers, dark green on a record's own detail map, and
near-black on the service-request map, so the same record read as a different
state depending on which map you clicked it from. It is amber everywhere now, as
it is on the shape you are drawing.

Four colours settled with it. A route stop that is retired paints the same grey
a retired habitat does, and an inaccessible stop the same red, instead of a
shade of each that only the route map used. A record's own geometry on its
detail map paints the green its explorer paints, so the shape does not change
colour when you open it. The service request at the centre of its nearby map now
wears its own outreach mark and the radius around it reads as ground rather than
as another amber thing on the map.
