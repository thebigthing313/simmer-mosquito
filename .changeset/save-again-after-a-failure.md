---
'@simmer-mosquito/admin': patch
---

Fixed: Save stays pressable after a save that failed, so a dropped connection
can be tried again without editing anything. Five console forms, the unit, genus
and species catalog forms, Create Organization and the invitation form, left
Save disabled once a write failed, and the only way to press it again was to
change a field the operator did not mean to change.

The two that held the failure in their own state, Create Organization and the
invitation form, also drew a second alert with the same heading as the first.
Every one of the five now shows the failure in the one alert the form was
already drawing, and pressing Save runs the save again.
