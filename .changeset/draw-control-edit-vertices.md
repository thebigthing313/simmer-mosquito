---
'@simmer-mosquito/web': minor
---

Added: move, add and remove the vertices of a shape you have already finished.
Edit vertices opens the piece on the map with every vertex it has, its holes'
included. Drag one to move it, click an edge to put a new one between that
edge's two ends, and press Delete to drop the vertex you last clicked. Finish
puts the piece back where it was in the list, Cancel leaves it as it was, and
Undo takes back one gesture at a time without eating into the piece you opened.
It sits on the location panel at one piece and on each piece's row once there
are more, beside Continue and Cut hole. A point is one vertex, so editing it
moves that vertex.

Added: an edit that leaves a ring with fewer than three vertices, or a line with
fewer than two, cannot be finished. The shape turns red and the map toolbar asks
for a vertex back, which any edge click gives it. So does an edit that pulls the
outline in past a hole, which is refused the same way a redrawn outline already
was.
