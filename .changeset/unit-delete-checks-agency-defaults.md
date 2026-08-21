---
'@simmer-mosquito/admin': patch
---

Fixed: Deleting a unit is now refused while any agency has it set as a default, which the confirmation dialog had always promised. Deleting one used to succeed and leave that agency's default naming a unit that no longer existed.
