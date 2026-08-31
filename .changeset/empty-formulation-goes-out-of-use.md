---
'@simmer-mosquito/web': patch
---

Fixed: Taking the last usable ingredient out of a formulation now takes the formulation out of use with it. It used to leave an active recipe with nothing that could be mixed from it, and an ingredient whose product had been retired still counted as something being in there.
