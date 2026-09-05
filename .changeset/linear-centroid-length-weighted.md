---
'@simmer-mosquito/web': patch
---

Fixed: the marker on a drawn line no longer moves once the record saves. It was
placed at the average of the line's corners and stored at the middle of the
line's length, so it jumped as far as the spacing was uneven. Lines with one long
span, and multi-part lines with a short crowded part, moved the most.
