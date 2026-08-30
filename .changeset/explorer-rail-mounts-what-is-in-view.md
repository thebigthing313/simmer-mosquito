---
'@simmer-mosquito/web': minor
---

Fixed: An explorer's result rail draws only the rows in view, and carries a control that skips past them to the pager. A page of 50 records used to put 150 tab stops between the list and its paging, with no way around them, and re-rendering all 50 on every map move stalled the drag.
