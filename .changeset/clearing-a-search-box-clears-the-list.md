---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: clearing a search box now clears what it was narrowing. On the traps,
habitats, addresses, regions, weather station and service request lists, and on
the add-a-stop picker in the route editor, the X emptied the field and left the
list filtered on the text that had just gone from the screen until the pause
behind the field ran out.

Fixed: three search boxes that had no clear control have one. The lookup
catalogs, the contacts list, and the region picker that fills a shape from a
boundary could only be emptied by selecting the text.

Changed: every search box in the app draws the same way, and each one says what
it searches to a screen reader. There were two versions of the box in the shared
component library and six more copied by hand, and they had drifted in spacing,
in whether the magnifier sat inside the frame, and in whether the box was named
at all.
