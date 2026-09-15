---
'@simmer-mosquito/web': patch
---

Fixed: An assignment's deadline is now a date and a time under one `Due` label
on the create and edit forms, where it was a `Due time` on the assignment date
with no way to name another day. A deadline stored on another day used to open
in the edit form as that time on the assignment date, and any edit to the
details saved it there, so the deadline moved without anyone changing it.
Opening and saving with no change now leaves the deadline where it was. Typing
a time with no date picked dates the deadline on the assignment date, a date
the operator has picked stays where it is when the assignment date changes,
and a deadline with one half missing cannot be saved. Both halves read and
save on the organization's clock, so a dispatcher in another zone sees the
same deadline the crew does.
