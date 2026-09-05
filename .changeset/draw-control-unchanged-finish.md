---
'@simmer-mosquito/web': patch
---

Fixed: finishing a piece you changed nothing on no longer counts as redrawing
it, so Cancel is no longer the only exit that leaves the shape alone. Continue
followed by Finish with no corner placed put the same outline back and marked
the form as redrawn, which on a habitat asks for a permission collectors do not
have and refused the whole save. Editing a piece and finishing it where it was
did the same. What the shape becomes is compared against what it was, and the
save only carries a location change when the two differ.
