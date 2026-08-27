---
'@simmer-mosquito/web': minor
---

Added: The maps show a key for the colours they draw, listing only the statuses or densities the current filters can put on screen. Habitats, Inspections, Samples, Traps, Collections and Service Requests each have one.

Changed: The collections map paints each collection by status, the way the samples map does: amber while the trap is still out, teal once it is in, slate for a zero result, red for a reported problem. The service requests map draws open requests in red and closed ones in the resolved teal every other surface uses for finished work.

Changed: Rows drop the status pill that repeated their dot. The dot at the left of a habitat, inspection, trap, sample, collection or service request row now draws in the colour the map paints that record and the key names, and reads its status to a screen reader. What the dot cannot say stays: the life-stage strip on an inspection, the species chips on a sample, the Bycatch badge on a collection.
