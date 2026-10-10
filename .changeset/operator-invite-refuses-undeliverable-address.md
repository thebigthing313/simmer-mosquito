---
'@simmer-mosquito/admin': patch
---

Fixed: Inviting someone to an organization with an address that has no dot after the `@`, or a space in it, is refused before anything is saved, with a message naming the email. It used to leave an invited membership behind that nobody could claim, and report the failure as an error from the invitation service.
