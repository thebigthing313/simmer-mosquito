---
'@simmer-mosquito/web': patch
---

Fixed: the two cleanup pages and the habitat merge now refuse a role below manager before the page loads, instead of letting one fill the whole merge in and be refused at the save. Every write surface reads its role floor from one register, so a form's floor is the same fact the sidebar filters on and the server enforces.
