---
'@simmer-mosquito/web': minor
---

Changed: A suggestion row on the contact and address cleanup pages now shows
every column the merge can carry, each under its own label: company, department,
title, email, preferred phone and alternate phone for a contact; the street
lines, locality, region, postal code and coordinates for an address. The value
the group matched on is repeated on each row, so you can confirm the match
instead of taking the heading's word for it. A column the record leaves empty is
left off. The row wraps a long value onto a second line rather than cutting its
end off.
