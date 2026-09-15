---
'@simmer-mosquito/web': patch
---

Fixed: The map card for a habitat inspection no longer draws a blank title. A habitat named with spaces alone read as named, so the card's heading was those spaces and nothing else. It now falls through to the habitat's coordinates, the linked address, or "Ad-hoc inspection", which is what every other inspection surface already did.
