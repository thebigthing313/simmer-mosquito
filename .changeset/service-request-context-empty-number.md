---
'@simmer-mosquito/web': patch
---

Fixed: in the service request context settings, clearing Days before or Days after and saving now says that field is required and saves nothing. Before, the empty field was saved as 0 with no message. Search radius must be greater than zero, the same rule the server applies, and an empty, zero or negative radius is refused in the sheet with a message naming Search radius. A fractional radius such as 0.25 now saves; the browser used to refuse it unless it differed from the saved radius by a whole number.
