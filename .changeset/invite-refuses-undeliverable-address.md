---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Fixed: Inviting someone to an address with no dot after the `@`, or with a space in it, is refused before anything is saved. It used to leave an invited membership behind that no invitation could reach, and the operator console reported the failure as a WorkOS error.
