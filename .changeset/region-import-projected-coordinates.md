---
'@simmer-mosquito/web': patch
---

Fixed: the bulk Region import now withholds shapes whose coordinates are not
longitude and latitude, and says how many it withheld and to re-export the file
as WGS84 (EPSG:4326). An export in State Plane feet or UTM metres parses as
valid GeoJSON, so every polygon was offered, the preview map showed nothing, and
pressing Import produced one failure line per region. This is the check the
"fill geometry from a file" dialog already applied.
