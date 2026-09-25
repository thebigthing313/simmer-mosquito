---
'@simmer-mosquito/web': minor
'@simmer-mosquito/admin': patch
---

Added: SIMMER works on a tablet or a phone. Under a laptop's width the sidebars move into a drawer that the button at the left of the header opens, and it closes when you pick a page. Map pages and record forms stack the map above the list or the form when the two do not fit side by side. Each browser tab and history entry is named for the page it shows, such as `Table · Habitats`.

Changed: Form fields sit two to a row only when the form is wide enough for them, not whenever the window is. Buttons grow to a comfortable size for a finger on a touch screen. The small uppercase labels over groups of fields and lists are one size and weight everywhere, and nothing on the page is set smaller than 12px. With reduced motion turned on, dialogs, menus and the map stop sliding, zooming and flying.

Fixed: A screen reader names every field and switch in the organization settings, reads out a save error when it appears, says which row a Remove button removes, and announces the new page after you navigate. Keyboard focus moves to the page after you pick a link in the sidebar. The pointer shows over every clickable feature on a map, not only over the last layer drawn. Controls that appeared only on hover show on a touch screen. The first page loads less code.
