---
'@simmer-mosquito/admin': patch
---

Fixed: creating an Organization now refuses a billing contact name over 200 characters or a billing email over 320, with a message naming the field. Neither had a limit before.
