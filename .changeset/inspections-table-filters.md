---
'@simmer-mosquito/web': minor
---

Added: The Inspections table filters on date range, water, density, larvae
found, habitat type and inspector. Each one narrows the query the server
answers rather than hiding rows already loaded, and setting one takes the window
back to its first page. The filters are the map explorer's, held in the same
address, so a filtered link opens the same set on either surface. Set filters
show as chips you can remove one at a time or clear together. The table offers
no Region filter: region membership is a spatial question the server resolves,
and the table's query can only ask about columns.
