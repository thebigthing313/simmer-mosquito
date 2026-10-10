---
'@simmer-mosquito/admin': patch
---

Fixed: creating an Organization now refuses the contact details an edit to it would refuse: a Main contact or billing email that is not an email address, a state that is not a US state code, a country other than US, and a detail longer than its limit. A country longer than two letters used to fail after the Organization already existed in WorkOS, leaving it with no SIMMER record.
