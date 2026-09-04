---
'@simmer-mosquito/web': minor
---

Added: Daily Work, one person's field work for one day at a page of their own.
Open `/daily-work/<profile id>` and it lists that day's entries in the rail,
draws them on the map, and opens the same focus card the Activity Monitor does.
The person is the address rather than a picker, so a day is a link somebody can
be sent, and the only control left is which day. It opens on today in the
organization's timezone, and no future day can be picked. A link that names
nobody in the organization says so instead of drawing an empty day.

Added: the map on that page carries a key to the four record families, listing
only the ones the chosen day put on screen. The per-family counts that sat in
the Activity Monitor's filter card are not repeated there.
