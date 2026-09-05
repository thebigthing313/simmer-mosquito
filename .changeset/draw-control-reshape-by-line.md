---
'@simmer-mosquito/web': minor
---

Added: reshape a piece by sketching a line across its edge. Open a piece for
editing, press Reshape, and click a line that crosses the edge at least twice.
The stretch of edge between the first crossing and the last is replaced by the
line, so a line drawn outside the piece pushes the edge out and one drawn inside
pulls it in. Nothing asks which you meant: where the line runs is the answer.
Double-click or Finish keeps the line, a second Finish puts the piece back at its
place in the list, and Cancel leaves it as it was. The holes the piece already
had ride through untouched. A line drawn on a line does the same thing to it.

Added: a reshape that cannot be kept says so and draws red rather than refusing
the gesture. A line that crosses the edge fewer than twice has no stretch to
replace, a line that leaves a hole outside the piece is refused the way a redrawn
outline already was, and a line that folds the edge back over itself leaves
nothing of the piece. Undo takes back the line one click at a time and closes an
empty one, so a Reshape pressed by mistake does not cost the edit.

Fixed: an edit that leaves three corners on one straight line now says it leaves
nothing of the piece. It could not be finished before either, and said nothing
about why.
