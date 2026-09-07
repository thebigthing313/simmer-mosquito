---
'@simmer-mosquito/admin': patch
---

Fixed: on the foundations panel, the open ring beside a setup step nobody has
done yet is dark enough to see. The ring is what says "still needed" next to the
green check that says "in place", and it was drawing in the pale divider colour
rather than the darker one the code asked for, because the darker role was
declared in the stylesheet and never registered with Tailwind, so the class
naming it generated no rule at all.
