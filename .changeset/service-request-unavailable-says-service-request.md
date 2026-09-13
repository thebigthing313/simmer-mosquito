---
'@simmer-mosquito/web': patch
---

Fixed: A Service Request that could not be loaded now says so in the same words
on both screens. The detail page derived its description from the noun "request"
and then typed the heading over the top, so the heading read "Service Request
Unavailable" while the line under it read "This request could not be loaded".
The edit page derived both from "service request" and read correctly. The detail
page now derives both from the same noun, and the two screens agree.
