---
'@simmer-mosquito/web': patch
---

Changed: the Contact and Mission forms draw in the same frame as every other
page. The loading skeleton that precedes them is a centred column, and the form
that replaced it was pinned to the stage's left edge, so the title jumped
sideways when the page landed, by 12px on a 1920 screen and 148px on a 2560
one. The form now sits in the same frame with the same padding, so the title
lands where the skeleton's stood. The header and the save bar still pin to the
top and foot of the page, and the fields keep the widths they had. The forms
with a map beside them are unchanged.
