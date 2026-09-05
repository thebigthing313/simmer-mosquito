---
'@simmer-mosquito/web': patch
---

Fixed: picking a value from a dropdown beside the map no longer finishes the
shape you are drawing. Enter on an open list chose the value and ended the
outline in the same press, so every corner walked after it went nowhere. Enter
that opens a dropdown does the same and no longer does either. Enter with the
map itself in hand still finishes, on a draw, a hole, a continuation, an edit
and a reshape line alike.
