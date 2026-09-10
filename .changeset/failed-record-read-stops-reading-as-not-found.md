---
'@simmer-mosquito/web': patch
---

Fixed: A trap, collection or region whose read failed now says the read failed.
The three detail pages had no way to say it: the hooks behind them returned the
record and whether the collection had answered, and nothing else, so a failed
read arrived looking like a table with no such row and the page drew "could not
be found, or you do not have access to it". That told an operator to stop
looking for a record that exists. The six single-record hooks are on one factory
now, and reporting the failure is what it does rather than what each hook
remembers.
