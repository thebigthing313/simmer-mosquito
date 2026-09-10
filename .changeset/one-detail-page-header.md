---
'@simmer-mosquito/web': patch
---

Changed: every record detail page now opens with the same pinned header. On the
left, the record's icon and type over its name and supporting line, with a
pencil and a `...` against the name. On the right, its flags and its Tags.
Fifteen pages drew fifteen headers before, four of them hand-built.

Changed: a record's Tags are visible without opening a card, on the six record
kinds that take them.

Changed: an action that is not editing moves into the `...` menu. Merging a
habitat, managing a contact's registrations, collecting a pending collection,
and resolving or reopening a request for control.

Removed: the "Back to X" link at the top of a record. The breadcrumb above the
page and the browser's own back button both already go up, and the link named a
fixed destination, so a habitat opened from Daily Work offered "Back to
habitats".

Removed: the "View habitat" and "View inspection" buttons on the larval
inspection and sample pages. Both records already link to their source in the
fact card beside the map.
