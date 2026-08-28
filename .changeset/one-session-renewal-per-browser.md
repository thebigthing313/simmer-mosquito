---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: Having the app open in several tabs no longer risks ending your session. Each tab renewed your sign-in on its own schedule, and two renewals landing together could sign you out of all of them.
