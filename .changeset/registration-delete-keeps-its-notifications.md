---
'@simmer-mosquito/web': patch
---

Fixed: Deleting a notification registration is now refused while a mission notification names it, and the refusal says how many. The delete used to go through and leave those notifications pointing at a registration nobody could see. The registration panel also gets the danger zone card every other record has, which states what the delete reaches before the button is pressed.
