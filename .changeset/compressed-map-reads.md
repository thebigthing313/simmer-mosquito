---
'@simmer-mosquito/web': patch
---

Changed: The map now downloads about half of what it used to. Every tile and every result-rail page left the server uncompressed, so framing an agency of 14,245 Habitats pulled 1.2 MB of tiles where 500 KB carries the same drawing, and each page of the rail was 32 KB where 5 KB would do. It applies to all eleven map layers, to the record reads behind the delete checks, and to the sync stream, which is the largest read of all.
