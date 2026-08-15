---
'@simmer-mosquito/admin': minor
---

Changed: Reaching the operator console now requires being signed in as SIMMER, rather than holding an operator account. Operators join the agencies they support, and while signed in to one of those agencies the console previously still opened — so the same person could be acting as an agency's admin and working the control plane in the same session. It now refuses that case and says to sign back in as SIMMER, which is the step that fixes it. The refusal an operator sees when the console is not theirs to reach used to say their account was not on the operator list; that was rarely the reason and named a fix they could not perform themselves.
