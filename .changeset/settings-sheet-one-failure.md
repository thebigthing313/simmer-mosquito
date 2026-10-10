---
'@simmer-mosquito/web': patch
---

Changed: The settings sheets in My Organization handle a failed save the same way. A value that cannot be saved keeps the sheet open with the reason shown above the fields, and once the sheet closes, a save the server refuses is reported in a notification.
