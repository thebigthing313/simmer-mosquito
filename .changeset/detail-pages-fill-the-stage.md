---
'@simmer-mosquito/web': patch
---

Changed: a record detail page now fills the stage instead of sitting in a
centred 1200px column. On a 2560 screen the old frame left 47% of the space
between the rails empty. What made widening it safe is that the cards carry
their own measures: a fact list stops at 34rem, so a row's value no longer
runs 600px around 81px of ink.

Changed: a record's facts sit beside its map rather than above the comments in
the side rail. Twelve of the thirteen pages stacked them in the rail, and that
arrangement only showed its cost once the page was wide: the trap's map came
out 1130px across and 280px tall. The rail is the conversation now.

Fixed: the split between a record and its side rail was measured against the
viewport, which is the window including 304px of rails the page never gets. On
the contact page a viewport of 1279 gave the record 896px and 1280 gave it
525px, so one pixel wider made the content 371px narrower. It now measures the
space it is actually dividing.

Fixed: the habitat, inspection and sample pages had no horizontal padding at
all, so their cards sat flush against the edge of the measure while every other
detail page had 32px.
