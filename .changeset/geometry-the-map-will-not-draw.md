---
'@simmer-mosquito/web': patch
---

Fixed: A record whose stored shape the map cannot draw now says so on its own
Location card, naming the shape it holds and the shapes that field takes. Until
now the geometry was handed to the map as-is, and the map dropped it without an
error, so the card read as a record that had never been located. The check runs
where the geometry is read, against the shapes the record's kind is allowed to
store, and it draws nothing rather than failing the page.
