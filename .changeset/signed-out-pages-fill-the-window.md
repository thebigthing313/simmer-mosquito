---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: The landing page and the sign-in, sign-up, invitation and password pages
now fill the window. The staging strip above them took a row of its own, and on
every other deployment that strip renders nothing, so the page was laid out in
the row above an empty one and stopped part way down the screen with dead space
under it.
