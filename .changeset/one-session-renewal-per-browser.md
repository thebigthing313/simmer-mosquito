---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: Working in two tabs at once no longer risks ending your session. Each tab renewed its sign-in on its own schedule, and two renewals landing together could sign you out of both.
