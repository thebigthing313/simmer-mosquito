---
'@simmer-mosquito/web': patch
---

Fixed: the colour dot on an explorer row no longer paints a hover tooltip. On
the surfaces that dropped their status pill the dot is the only thing saying
whether a record is active or out of reach, and it carried both a label for a
screen reader and a `title` repeating the same word, so the dot announced
itself twice. The label stays and the tooltip is gone.
