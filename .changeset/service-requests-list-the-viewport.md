---
'@simmer-mosquito/web': minor
---

Changed: the Service Requests rail now lists the requests inside the viewport,
the way the ten other map explorers do. It used to list the whole Organization's
requests, 25 rows at a time, while the map beside it drew every one of them at
once, so an Organization three seasons in was scrolling a rail of over a
thousand rows to find the request it was looking at. It pages 50 at a time now,
the count under the collapsed panel reads `n in view` rather than `n service
requests`, and the pager's count reads `n service requests` on every page
rather than only past the first. An empty rail says why: `No service requests
in view` over `Pan or zoom the map, or loosen the filters to bring service
requests into range.` when matches sit outside the viewport, `No service
requests match these filters` with `Reset filters`, or `Show filters` when only
the default Open status narrows it, when nothing matches anywhere, and `No
service requests yet` with `New Service Request is in the More actions menu.`
when the Organization has none. `No requests match`, `Try a different filter or
search term.` and `Log a service request to start tracking public reports.` are
gone. The status, search, tag and region filters narrow the map and the rail
together, and the map's points draw as tiles rather than as a copy of the rail,
so the map no longer waits for every request to arrive before it draws one.
