---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Changed: nothing in either app says login. What a person signs in with is an
Account, and two badges called it something else.

In People, the line under a name is that Profile's email address, so it reads
"No email" when there is none, which is what the operator console has said on
the same line all along. In the console's member list, somebody who has been
invited and has not arrived yet is "Never signed in" rather than "No login yet".

Two quieter strings came with them. The sidebar falls back to Account when
neither the Profile nor the Account carries a name, and the error you get when
your Account has no active organization says that rather than naming you a user.
