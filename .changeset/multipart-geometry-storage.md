---
'@simmer-mosquito/web': minor
---

Changed: a record's geometry can now be stored in several pieces. A Region takes
a MultiPolygon, and Habitats, Inspections, the four control actions, Requested
Control Actions and Mission Items take all six shapes, so a park on three
separated lots is one Region and a treated area split by a road is one record.
The Region filter reads a multipart record the way it reads a single one: two
areas have to overlap, not merely share an edge. Drawing pieces comes next; this
is the storage and the filter. A Notification Registration now takes a point or
an area only, because two places are two Registrations.
