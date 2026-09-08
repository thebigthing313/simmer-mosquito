---
'@simmer-mosquito/web': patch
---

Fixed: clearing a trap's name on a trap that has no code is now refused, with a
message saying a trap needs a name or a code. The rule was read against the
fields an edit happened to name, and an edit that clears the name sends only
that column, so the check ran only on the edits that moved the name and the code
together. Clearing one at a time saved a trap carrying neither, which then drew
with nothing to read it back under.

The rule now runs against the trap as the edit will leave it, so a name can
still be cleared on a trap that keeps a code, and an edit to the description
alone is unaffected.
