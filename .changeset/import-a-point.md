---
'@simmer-mosquito/web': minor
---

Added: fill a record's location from a file wherever that record holds a point.
A Trap, an Address, a Collection, a Service Request and a Weather Source each get
the File button beside the draw tool for the first time, and it reads a point out
of a KML, KMZ or GeoJSON file the way it already read an area or a line. The
dialog reads "Import a Point", and a file whose coordinates are not longitude and
latitude is withheld with the same note an area gets.

Added: a file holding several points under one feature comes in as one shape with
a piece per point, on a record that stores several pieces. A record that holds a
single point refuses it by name instead of leaving it out.

Changed: a KML placemark that carries a label point beside its polygon is refused
as mixed geometry, with a line saying so. It used to come in as the polygon alone.
