---
'@simmer-mosquito/web': patch
---

Fixed: A re-invitation that cannot reach WorkOS now says why. Killing the old link is the first thing it does, and when that failed the People page showed the same sentence it shows for any failed write. It now reads either that the invitation could not be sent and to try again shortly, or that trying again will not help. The person keeps the link they already have either way.
