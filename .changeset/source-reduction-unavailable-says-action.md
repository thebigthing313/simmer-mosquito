---
'@simmer-mosquito/web': patch
---

Fixed: A Source Reduction Action that could not be loaded now heads its screen
"Source Reduction Action Unavailable", the way every other record type heads its
own. The heading is derived from the record's noun, and source reduction was the
one type that overrode it, on its detail page and in three places on its edit
page, so the word Action dropped out. A Biocontrol Action next to it kept the
word, which left the same failure on two sibling screens reading as two
different things.
