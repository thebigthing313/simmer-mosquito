---
'@simmer-mosquito/web': minor
---

Changed: the Address Book rail now lists the addresses inside the viewport,
the way the nine map explorers do. It used to list the whole Organization's
address book, 25 rows at a time in alphabetical order, while the map beside it
drew one box, so an address in the rail was often nowhere on screen. It pages
50 at a time now, the count under the collapsed panel reads `n in view` rather
than `n addresses`, and the pager's count reads `n addresses` on every page
rather than only past the first. An empty rail says why: `No addresses in
view` over `Pan or zoom the map, or loosen the filters to bring addresses into
range.` when matches sit outside the viewport, `No addresses match these
filters` with `Reset filters` when a search or region matches nothing
anywhere, and `No addresses yet` with `Create Address is in the More actions
menu.` when the Organization has none. `No addresses match`, `Try a different
search term or region.` and `Create an address to build the shared address
book.` are gone. The search now matches the display name, first street line,
locality, region and postal code on the map as well as in the rail; the map's
points used to match the display name alone.
