---
'@simmer-mosquito/web': patch
---

Fixed: A search result for a comment written on a route now waits for the route to load before it opens, instead of opening the habitat route page and reporting that the route does not exist. The row spins while it waits and opens as soon as the route arrives.
