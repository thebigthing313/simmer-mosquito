---
'@simmer-mosquito/web': patch
---

Fixed: Sending somebody a new invitation works. One address holds one invitation at a time, and the old one was cancelled only after the replacement had been sent, so the send was refused every time.
