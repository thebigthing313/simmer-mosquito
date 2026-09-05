---
'@simmer-mosquito/web': patch
---

Fixed: the measure tool now answers Enter and Escape only when the map is the
thing you are working in. Enter anywhere on the page finished the open
measurement and Escape threw it away, including the Escape that closes a
dropdown and the Enter that picks a value from one, so a measurement taken while
reading the panel beside the map rarely survived. A line, a box and a circle all
still finish on Enter and clear on Escape with the map in hand, and Finish and
Clear are on the measure panel as before.
