---
'@simmer-mosquito/web': patch
---

Fixed: Enter typed into a field beside the map no longer finishes the shape you
are drawing. The panel stays live while a draw is open, so an Enter meant to end
a line in a description ended the outline instead, and put the half-drawn shape
on the form. Enter now finishes only when it was not aimed at a field, which is
the rule Delete already followed.
