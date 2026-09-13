---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: A refusal that used to read as a code now reads as a sentence. A merge
the server would not run, a record naming a chemical or a trap that is no longer
available, and a notification generation it refused each put a word like
`target_inactive` or `missing` where the explanation goes. Signing in against a
session that had ended, or one with no Organization chosen, did the same. The
operator console had been papering over three of those with sentences of its
own; it now shows what the server says.
