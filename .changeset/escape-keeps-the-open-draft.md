---
'@simmer-mosquito/web': patch
---

Fixed: Escape no longer throws away an open boundary you are drawing when the
key was meant for something else. A press in a field beside the map, and a press
that closes a dropdown or a popover there, both leave the draft where it was.
Escape with the map itself in hand still cancels. It cost a whole walked
boundary in one press, on a draw, a hole, a continuation, an edit and a reshape
line alike.
