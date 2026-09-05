---
'@simmer-mosquito/web': patch
---

Fixed: keys now reach the map only when the map is the thing you are working in.
Enter on a button beside the map finished the shape as well as pressing the
button, Escape on one threw the whole draft away, and Delete or Backspace with a
dropdown open took a corner off the shape being edited. The draw takes the map
in hand when it opens, so Enter still finishes, Escape still cancels and Delete
still removes the picked corner from the first press, on a draw, a hole, a
continuation, an edit and a reshape line alike. Arrow-key panning works from the
same moment, where it used to need a click on the map first.
