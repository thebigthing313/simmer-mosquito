---
'@simmer-mosquito/web': patch
---

Fixed: Touching the map just after opening or collapsing the results panel no longer leaves later selections off-centre. A zoom, a drag or a fit made while the map was still making room for the panel used to leave it framed for a panel half open, so every record picked after that landed beside the middle of the visible map instead of in it.
