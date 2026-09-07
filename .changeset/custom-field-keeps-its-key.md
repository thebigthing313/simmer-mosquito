---
'@simmer-mosquito/web': patch
---

Fixed: renaming a custom field no longer empties that field on every record that
already answered it.

The custom-field editor on the method and habitat-type catalogs, and on the two
My Organization pages, used to work out where a field's answers are stored from
the field's name. Rename "Wing condition" to "Wing state" and the answers stayed
where they were while the field went looking somewhere else, so every record read
as if it had never answered. It happened on each keystroke, so saving mid-rename
moved the field to a half-typed name.

A field now keeps the place it stores answers for its whole life. Renaming it
changes what it is called on screen and nothing else. A field somebody has just
added still takes its storage from its name, and two fields whose names would
agree still get separate places to store answers.

Nothing was deleted, and an answer written before this fix is still on the
record. Where a rename has already happened, that answer shows on the record's
detail page under the old field name, marked Retired.
