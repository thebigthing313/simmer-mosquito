---
'@simmer-mosquito/web': patch
---

Fixed: A record can no longer be saved against another agency's address, habitat, inspection, contact, or person. Those ids came straight off the request and nothing checked whose they were, so a hand-built request could file your agency's work against a record you would never be able to open.
