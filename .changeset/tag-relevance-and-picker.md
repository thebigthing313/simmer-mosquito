---
"@simmer-mosquito/web": patch
---

Added: a Tag names the record types it is suggested for, and every record detail page has a tag picker. The Tags table under My organization carries a `Suggested For` column, edited from a select that lists the six taggable record types and reads `All records` when the set is empty. The picker opens from a counted `Tags` button in the record header and lists the whole catalog in two sections, the tags suggested for that record type first, with a search over names and descriptions; a checkbox writes on the click, and a chip can be taken off from the header. Nothing is enforced: the set decides which tags are offered first, and any active tag still goes on any record that can carry one.
