---
'@simmer-mosquito/web': patch
---

Fixed: a Region drawn in more than one piece now saves. Create refused it with
"Draw the region boundary before saving." while the pieces were on the map in
front of you, and an edit that added a piece saved the name and the folder and
kept the boundary it loaded, with nothing on screen to say the redraw had been
dropped. Importing a multipart Region was already correct.
