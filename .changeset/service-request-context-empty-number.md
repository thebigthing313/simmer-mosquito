---
'@simmer-mosquito/web': patch
---

Fixed: clearing Days before or Days after in the service request context settings no longer saves 0, and the sheet says the field is required. An empty, zero or negative Search radius is refused in the sheet with a message naming it, and a fractional Search radius such as 0.25 now saves.
