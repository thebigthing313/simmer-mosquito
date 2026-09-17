---
'@simmer-mosquito/web': patch
---

Fixed: A page's right edge no longer moves when it replaces the loading skeleton. The frame reserves room for its scrollbar whether or not the page scrolls, so the page lands where the skeleton stood.
