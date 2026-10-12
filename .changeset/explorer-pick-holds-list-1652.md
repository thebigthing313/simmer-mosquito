---
'@simmer-mosquito/web': patch
---

Fixed: Picking a row on an explorer's map list flies the map to the record and leaves the list as it was, so the row you picked stays where you clicked it. Panning or zooming the map still refreshes the list. Service Requests already worked this way; now every explorer does.
