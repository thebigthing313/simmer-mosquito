---
'@simmer-mosquito/admin': patch
---

Fixed: creating an Organization now refuses the contact details an edit would refuse, such as a Main contact or billing email that is not an email address, a state or country outside the US, or a detail over its length, instead of failing partway through the create.
