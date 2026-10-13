---
'@simmer-mosquito/web': patch
---

Fixed: An area no longer counts as inside a region it overlaps only by a sliver along a shared boundary. The overlap has to cover at least 0.1% of the smaller of the two areas, so neighbouring municipalities stop listing each other in the Regions panel and on the Region filter. Regions that crossed themselves are repaired when saved, and their membership no longer fails to load.
