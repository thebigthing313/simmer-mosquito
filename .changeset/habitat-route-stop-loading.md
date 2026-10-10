---
'@simmer-mosquito/web': patch
---

Fixed: A stop on a habitat Route whose Habitat is still loading is now named Habitat followed by the start of its id, rather than a bare comma. On the Route's edit page its description cannot be edited until the Habitat arrives, so a save no longer replaces the Habitat's description with an empty one.
