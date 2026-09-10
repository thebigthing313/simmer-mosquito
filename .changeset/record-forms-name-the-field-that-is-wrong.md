---
'@simmer-mosquito/web': patch
---

Fixed: A record form that refuses a save now puts the message on the field it is
about. Nine forms ran a second set of checks that stopped at the first broken
rule and put one sentence in the alert at the top of the page, leaving you to
find which box it meant. Editing a service request had only those checks, so it
named no field at all, and a trap still in the field with no set date, an
alternate phone with no preferred one, and each contact notification preference
missing its channel all reported the same way.
