---
'@simmer-mosquito/web': minor
---

Changed: an empty rail on the nine map explorers, Habitats, Inspections,
Samples, Traps, Collections, Chemical Applications, Source Reductions,
Biocontrol Actions and Outreach Actions, now says why it is empty rather than
always asking for a pan. The map already asks the server for the extent of the
filtered set to frame it, and the rail reads that same answer. With matches
somewhere outside the viewport it still reads `No habitats in view` over `Pan
or zoom the map, or loosen the filters to bring habitats into range.` With
none anywhere and a filter applied, the default status or date window
included, it reads `No habitats match these filters` with a `Reset filters`
control, or `Show filters` when the defaults are what narrowed it. With none
anywhere and no filter at all it reads `No habitats yet`, and a reader who can
add one is told `Create Habitat is in the More actions menu.`, by the same
label the menu draws. Each of the nine spells its noun the way its heading
does, so `No releases in view`, `No source reduction in view` and `No outreach
in view` are gone. While the extent is still loading the rail draws its
placeholders instead of guessing.
