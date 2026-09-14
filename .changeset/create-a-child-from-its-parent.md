---
'@simmer-mosquito/web': patch
---

Added: a record's `...` menu offers the records that hang off it, and the form
opens with the parent already filled in. A habitat offers an inspection and the
three control actions; a trap offers a collection; an inspection offers the
three control actions, filed against its habitat; an address offers a habitat,
a trap and a service request; a contact offers a service request.

Fixed: a habitat picker holding a habitat it did not pick itself drew its
placeholder over the value. An edit form opened on a record with a habitat
showed an empty field, so the operator picked the habitat the record already
had.
