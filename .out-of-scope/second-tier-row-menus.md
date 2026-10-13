# Row menus on second-tier rows

Rows that live inside an expanded catalog row keep their inline edit and delete
buttons. They do not move to the "..." row menu that top-level catalog rows use.
Insecticide batches under an insecticide and products inside a formulation are
the two cases today.

## Why this is out of scope

The 2026-10-12 decision on #1666 moved insecticide and formulation rows onto the
"..." menu with Edit and a reversible retire. Its reason was lifecycle: the old
inline X deactivated a row but read as delete, and a row whose main action is a
reversible retire should offer it the way every other catalog does.

A second-tier row has no retire. A batch or a formulation's product is either
there or deleted, so its delete is its whole lifecycle and an inline delete
button says exactly what it does. The confusion #1666 fixed cannot happen here,
and a menu would add a click to the one action the row has besides edit.

The reasoning is also recorded under "InsecticideSection and FormulationSection"
in `docs/web-components.md`.

If a second-tier record ever gains a reversible retire, it should move to the
menu, and this note should be deleted.

## Prior requests

- #1693: "Insecticide batch and formulation product rows keep inline edit and delete buttons"
