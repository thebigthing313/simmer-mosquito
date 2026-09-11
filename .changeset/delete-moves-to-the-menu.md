---
'@simmer-mosquito/web': patch
---

Changed: deleting a record is the last item in the `...` menu beside its name,
and the block at the foot of every detail page is gone. That block spent a
permanent section on an action wanted on almost no visit, and said the same
thing twice on the way to one decision.

Changed: the confirmation carries the whole decision now, including the case
where the delete is refused. It names what goes with the record, what survives
with its link cleared, and what is still referencing it. Its Delete button is
destructive-coloured, and it is turned off while something still blocks the
delete.

Fixed: a detail page no longer asks the server what deleting the record would
affect on every visit. The question is asked when somebody opens the
confirmation, which is also when the answer is fresh enough to act on.
