---
'@simmer-mosquito/web': minor
---

Added: An assignment copied from a route is named after the route and its date
before anyone types, `North loop, Sep 15, 2026`, so it carries the route it
came from on the assignments list, the operations overview and its own page.
Choosing a route, changing the route or moving the assignment date keeps the
name current while the Name field is empty or still holds what the form wrote;
a name the person typed is never overwritten. Clearing the route or switching
back to Blank clears an unedited name and leaves an edited one alone.
