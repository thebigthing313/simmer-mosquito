---
'@simmer-mosquito/web': minor
'@simmer-mosquito/admin': minor
---

Added: the staging environment banner now sits above the signed-out pages too:
the landing page, sign in, sign up, forgot and reset password, accept
invitation, and the operations console's sign in. It says the deployment is a
copy of the production system that the next refresh erases, and expands to say
that sign-in details are the real production ones and that staging does not
allow changes to sign-in accounts, Memberships, roles, Agencies, or invitations.
Four of those pages are ones staging refuses, so the rule is now readable before
the form is filled in. Production shows nothing.
