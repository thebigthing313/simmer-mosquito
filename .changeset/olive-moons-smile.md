---
'@simmer-mosquito/web': patch
---

Fixed: Unit defaults could not be changed. Every dropdown in the Unit Defaults editor was empty, so there was nothing to pick, and the summary above it listed raw codes like `miles_per_hour` instead of unit names. Both are fixed, and the list is grouped so metric and imperial units no longer interleave.
