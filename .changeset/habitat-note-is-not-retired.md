---
'@simmer-mosquito/web': patch
---

Fixed: a note typed onto a habitat no longer reads as Retired. The custom fields
list badges every key the schema does not declare, and on five of the six record
kinds that badge is right, because those forms write only what their schema
declares and a key outside it is a field that was dropped.

The habitat form is the exception, and the only form in the app that lets
somebody add a key its type never declared. Its own description says so: the
fields this habitat type collects, plus any notes of your own. So the habitat
detail page was badging each of those notes Retired, which tells a reader the
value is historical when it is the one somebody just wrote.

The list now takes the answer from the caller, because the entry cannot carry it:
both cases arrive the same way. The habitat detail says its surface accepts extra
keys and gets no badge; every other surface says nothing and is unchanged, badge
included. A declared field with no value still reads Not recorded everywhere.
