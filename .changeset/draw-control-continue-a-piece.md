---
'@simmer-mosquito/web': minor
---

Added: carry on with a shape you have already finished. Continue puts the piece
back into draw mode with its vertices still on the map and the next click
adding to the end, so a boundary that stopped one vertex early no longer has to
be traced again. It sits on the location panel at one piece and on each piece's
row once there are more, beside Cut hole. A point has nothing to continue, so it
does not offer it.

Added: cancelling a continuation leaves the piece exactly as it was before you
pressed Continue, and Undo pops only the vertices you added during it. The
other pieces stay on the map and stay in the list throughout, and holes already
cut into the piece stay cut.
