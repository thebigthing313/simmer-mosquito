---
'@simmer-mosquito/admin': patch
---

Fixed: A refusal from the server now reads as a sentence rather than as a code.
A Foundations write that was refused used to put `operator_required` in the form
alert; it now says the account is not a SIMMER operator and to sign back in as
one. Sessions that have ended, organizations and profiles that cannot be found,
and an invitation to somebody who already has access each say what happened and
what to do next. A refusal the console has no sentence for falls back to the
screen's own wording, so a code never reaches the screen.
