---
'@simmer-mosquito/web': patch
---

Changed: filtering a map explorer no longer moves the camera when every match
is already on screen. It used to frame the filtered set on every change, so a
map that already showed all of them still jumped, and the rail asked the
server for the same rows a second time after the move. It still frames the set
when any match sits outside the view, and on first load.
