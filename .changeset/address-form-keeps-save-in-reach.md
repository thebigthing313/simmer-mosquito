---
'@simmer-mosquito/web': patch
---

Fixed: The address form now keeps Save and Reset pinned at the foot of the
column, where every other record form keeps them. On a short window the buttons
sat below the fields and scrolled out of reach. The same pass put the form's
refusals where the rest of the product puts them: a broken rule lands on the box
it is about instead of arriving as one sentence above the form, the display-name
length and the postal and state formats are checked before anything is sent
rather than coming back as a save that failed for no stated reason, and a save
the server refuses leaves Save ready for another attempt.
